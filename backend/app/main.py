"""Main FastAPI application for XR18 AI Controller"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal
import asyncio
import time
import json
from datetime import datetime

from .config import settings
from .adapters import BehringerAdapter
from .adapters.demo_adapter import DemoAdapter
from .ai_controller import AIAudioController, ChannelConfig, AIDecision
from .storage.learning_storage import LearningStorage
from .storage.session_db import SessionDatabase
from .services.logger import setup_logging, get_logger
from .services.alert_engine import AlertEngine, AlertConfig, AlertType, AlertSeverity
from .services.preset_analyzer import PresetAnalyzer
from .services.command_history import CommandHistory, SetFaderCommand, SetMuteCommand

# Initialize logging
logger = setup_logging(log_level=settings.log_level)
logger.info("Starting XR18 AI Controller application")

app = FastAPI(
    title="XR18 AI Controller",
    description="AI-powered controller for Behringer XR18/X32/M32 mixers",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
mixer_adapter: Optional[BehringerAdapter] = None
ai_controller = AIAudioController(history_window=settings.ai_history_window)
ai_enabled = False
active_websockets: List[WebSocket] = []
learning_storage = LearningStorage(data_dir=settings.learning_data_dir)
alert_engine = AlertEngine()
session_db = SessionDatabase()
preset_analyzer = PresetAnalyzer()
command_history = CommandHistory(max_size=50)


# Pydantic models
class ConnectionConfig(BaseModel):
    mixer_model: Literal["xr18", "x32", "m32", "demo"] = Field(default="xr18", description="Mixer model to connect to")
    ip_address: str = Field(default="192.168.1.1", description="IP address or 'DEMO' for simulation")
    port: Optional[int] = Field(default=None, description="OSC port (auto-detected if not specified)")


class ModeConfig(BaseModel):
    ai_enabled: bool


class ChannelConfigModel(BaseModel):
    channel: int
    max_threshold_db: float = -6.0
    target_level_db: float = -12.0
    min_threshold_db: float = -40.0
    auto_adjust_enabled: bool = True


class FaderControl(BaseModel):
    channel: int
    value: float  # 0.0 - 1.0


class MuteControl(BaseModel):
    channel: int
    mute: bool


class AIConfigModel(BaseModel):
    maxThreshold: float
    targetLevel: float
    minThreshold: float
    historyWindow: int
    confidenceThreshold: float
    adjustmentSpeed: float


# API Endpoints

@app.get("/")
async def root():
    """API status"""
    return {
        "name": "XR18 AI Controller",
        "version": "1.0.0",
        "status": "running"
    }


@app.post("/api/mixer/connect")
async def connect_mixer(config: ConnectionConfig):
    """Connect to mixer (supports DEMO mode)"""
    import sys
    sys.stdout.flush()

    print(f"\n{'='*60}", flush=True)
    print(f"CONNECT_MIXER CALLED - {datetime.now()}", flush=True)
    print(f"Model: {config.mixer_model}", flush=True)
    print(f"IP: {config.ip_address}", flush=True)
    print(f"Port: {config.port}", flush=True)
    print(f"{'='*60}\n", flush=True)

    global mixer_adapter

    try:
        if mixer_adapter and mixer_adapter.connected:
            await mixer_adapter.disconnect()

        logger.info(f"Connection request: model={config.mixer_model}, ip={config.ip_address}")

        # Check for DEMO mode
        if config.mixer_model == "demo" or config.ip_address.upper() == "DEMO":
            logger.info("Connecting in DEMO mode (simulated mixer)")
            model_to_use = config.mixer_model if config.mixer_model != "demo" else "xr18"
            logger.info(f"Creating DemoAdapter with model={model_to_use}")
            mixer_adapter = DemoAdapter(model=model_to_use)
            success = await mixer_adapter.connect("DEMO", 0)
        else:
            # Real hardware connection
            logger.info(f"Connecting to real hardware: {config.mixer_model} at {config.ip_address}")
            mixer_adapter = BehringerAdapter(model=config.mixer_model)
            success = await mixer_adapter.connect(config.ip_address, config.port)

        if success:
            # Subscribe to meters (only for real hardware)
            if not isinstance(mixer_adapter, DemoAdapter):
                await mixer_adapter.subscribe_to_meters()

            mixer_info = await mixer_adapter.get_mixer_info()

            for ch in range(1, mixer_info.channels + 1):
                ai_controller.configure_channel(ChannelConfig(channel=ch))

            return {
                "status": "connected",
                "mixer_info": {
                    "name": mixer_info.name,
                    "model": mixer_info.model,
                    "ip": mixer_info.ip,
                    "port": mixer_info.port,
                    "channels": mixer_info.channels,
                    "buses": mixer_info.buses
                }
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to connect to mixer")

    except Exception as e:
        import traceback
        error_detail = {
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }
        logger.error(f"Connection failed: {error_detail}")
        print(f"\n=== CONNECTION ERROR ===")
        print(f"Error Type: {type(e).__name__}")
        print(f"Error Message: {str(e)}")
        print(f"Full Traceback:\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@app.post("/api/mixer/disconnect")
async def disconnect_mixer():
    """Disconnect from mixer"""
    global mixer_adapter

    if mixer_adapter:
        await mixer_adapter.disconnect()
        mixer_adapter = None

    return {"status": "disconnected"}


@app.get("/api/mixer/info")
async def get_mixer_info():
    """Get mixer information"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    mixer_info = await mixer_adapter.get_mixer_info()

    return {
        "name": mixer_info.name,
        "model": mixer_info.model,
        "ip": mixer_info.ip,
        "port": mixer_info.port,
        "channels": mixer_info.channels,
        "buses": mixer_info.buses
    }


@app.post("/api/mode/set")
async def set_mode(config: ModeConfig):
    """Set AI mode (enabled/disabled)"""
    global ai_enabled

    ai_enabled = config.ai_enabled

    # Enable/disable command history based on AI mode
    command_history.set_enabled(not ai_enabled)

    if not ai_enabled:
        ai_controller.reset_all()

    return {
        "ai_enabled": ai_enabled,
        "message": "AI mode " + ("enabled" if ai_enabled else "disabled"),
        "command_history_enabled": command_history.enabled
    }


@app.get("/api/mode/status")
async def get_mode_status():
    """Get current mode status"""
    return {
        "ai_enabled": ai_enabled,
        "connected": mixer_adapter.connected if mixer_adapter else False
    }


@app.post("/api/channel/config")
async def configure_channel(config: ChannelConfigModel):
    """Configure channel settings"""
    channel_config = ChannelConfig(
        channel=config.channel,
        max_threshold_db=config.max_threshold_db,
        target_level_db=config.target_level_db,
        min_threshold_db=config.min_threshold_db,
        auto_adjust_enabled=config.auto_adjust_enabled
    )

    ai_controller.configure_channel(channel_config)

    return {
        "status": "configured",
        "channel": config.channel
    }


@app.post("/api/ai/config")
async def update_ai_config(config: AIConfigModel):
    """Update global AI configuration"""
    global ai_controller

    if mixer_adapter and mixer_adapter.mixer_info:
        for ch in range(1, mixer_adapter.mixer_info.channels + 1):
            channel_config = ChannelConfig(
                channel=ch,
                max_threshold_db=config.maxThreshold,
                target_level_db=config.targetLevel,
                min_threshold_db=config.minThreshold,
                auto_adjust_enabled=True,
                adjustment_speed=config.adjustmentSpeed
            )
            ai_controller.configure_channel(channel_config)

        ai_controller.history_window = config.historyWindow

        return {
            "status": "success",
            "message": "AI configuration updated for all channels",
            "config": {
                "max_threshold": config.maxThreshold,
                "target_level": config.targetLevel,
                "min_threshold": config.minThreshold,
                "history_window": config.historyWindow,
                "confidence_threshold": config.confidenceThreshold,
                "adjustment_speed": config.adjustmentSpeed
            }
        }
    else:
        raise HTTPException(status_code=400, detail="No mixer connected")


@app.get("/api/ai/config")
async def get_ai_config():
    """Get current AI configuration"""
    if ai_controller.channels_config:
        sample_ch = list(ai_controller.channels_config.values())[0]
        return {
            "maxThreshold": sample_ch.max_threshold_db,
            "targetLevel": sample_ch.target_level_db,
            "minThreshold": sample_ch.min_threshold_db,
            "historyWindow": ai_controller.history_window,
            "confidenceThreshold": 0.7,
            "adjustmentSpeed": sample_ch.adjustment_speed if hasattr(sample_ch, 'adjustment_speed') else 0.8
        }
    else:
        return {
            "maxThreshold": -6.0,
            "targetLevel": -12.0,
            "minThreshold": -40.0,
            "historyWindow": 100,
            "confidenceThreshold": 0.7,
            "adjustmentSpeed": 0.8
        }


@app.post("/api/channel/fader")
async def set_fader(control: FaderControl):
    """Set channel fader (manual control only)"""
    if ai_enabled:
        raise HTTPException(
            status_code=400,
            detail="Cannot set fader manually while AI mode is enabled"
        )

    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    # Get current state before adjustment for learning
    channels = await mixer_adapter.get_all_channels()
    current_channel = next((ch for ch in channels if ch.channel == control.channel), None)

    if current_channel:
        previous_level = current_channel.level_db
        previous_fader = current_channel.fader_value

        # Create command for undo/redo
        from datetime import datetime
        command = SetFaderCommand(
            mixer_adapter=mixer_adapter,
            channel=control.channel,
            old_value=previous_fader,
            new_value=control.value,
            timestamp=datetime.now()
        )

        # Execute via command history
        success = await command_history.execute(command)

        if success:
            # Record manual adjustment for learning
            if ai_controller.learning_enabled:
                ai_controller.record_manual_adjustment(
                    channel=control.channel,
                    previous_level_db=previous_level,
                    previous_fader=previous_fader,
                    new_fader=control.value
                )

            return {
                "status": "success",
                "channel": control.channel,
                "value": control.value,
                "learning_recorded": ai_controller.learning_enabled,
                "can_undo": command_history.can_undo()
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to set fader")
    else:
        raise HTTPException(status_code=404, detail="Channel not found")


@app.post("/api/channel/mute")
async def set_mute(control: MuteControl):
    """Mute or unmute a channel"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    # Get current mute state
    channels = await mixer_adapter.get_all_channels()
    current_channel = next((ch for ch in channels if ch.channel == control.channel), None)

    if not current_channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Create command for undo/redo
    from datetime import datetime
    command = SetMuteCommand(
        mixer_adapter=mixer_adapter,
        channel=control.channel,
        old_muted=current_channel.muted,
        new_muted=control.mute,
        timestamp=datetime.now()
    )

    # Execute via command history
    success = await command_history.execute(command)

    if success:
        return {
            "status": "success",
            "channel": control.channel,
            "muted": control.mute,
            "can_undo": command_history.can_undo()
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to mute channel")


@app.get("/api/channel/{channel}/stats")
async def get_channel_stats(channel: int):
    """Get channel statistics"""
    stats = ai_controller.get_channel_stats(channel)
    return stats


@app.get("/api/channels/all")
async def get_all_channels():
    """Get all channels information"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    channels = await mixer_adapter.get_all_channels()

    return {
        "channels": [
            {
                "channel": ch.channel,
                "name": ch.name,
                "level_db": ch.level_db,
                "fader_value": ch.fader_value,
                "muted": ch.muted
            }
            for ch in channels
        ]
    }


# ==================== Undo/Redo ====================

@app.post("/api/mixer/undo")
async def undo_last_command():
    """Undo last manual command"""
    if ai_enabled:
        raise HTTPException(
            status_code=400,
            detail="Cannot undo while AI mode is enabled"
        )

    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    description = await command_history.undo()

    if description:
        return {
            "status": "success",
            "action": "undo",
            "description": description,
            "can_undo": command_history.can_undo(),
            "can_redo": command_history.can_redo()
        }
    else:
        return {
            "status": "nothing_to_undo",
            "message": "No commands to undo",
            "can_undo": False,
            "can_redo": command_history.can_redo()
        }


@app.post("/api/mixer/redo")
async def redo_last_command():
    """Redo last undone command"""
    if ai_enabled:
        raise HTTPException(
            status_code=400,
            detail="Cannot redo while AI mode is enabled"
        )

    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    description = await command_history.redo()

    if description:
        return {
            "status": "success",
            "action": "redo",
            "description": description,
            "can_undo": command_history.can_undo(),
            "can_redo": command_history.can_redo()
        }
    else:
        return {
            "status": "nothing_to_redo",
            "message": "No commands to redo",
            "can_undo": command_history.can_undo(),
            "can_redo": False
        }


@app.get("/api/mixer/history")
async def get_command_history(limit: int = 10):
    """Get command history"""
    return {
        "status": "success",
        "history": command_history.get_history(limit=limit),
        "stats": command_history.get_stats()
    }


@app.delete("/api/mixer/history")
async def clear_command_history():
    """Clear all command history"""
    command_history.clear()

    return {
        "status": "success",
        "message": "Command history cleared"
    }


# ==================== Learning Mode ====================

class LearningConfig(BaseModel):
    enabled: bool


@app.post("/api/learning/enable")
async def set_learning_mode(config: LearningConfig):
    """Enable or disable learning mode"""
    ai_controller.learning_enabled = config.enabled
    return {
        "learning_enabled": config.enabled,
        "message": "Learning mode " + ("enabled" if config.enabled else "disabled")
    }


@app.get("/api/learning/status")
async def get_learning_status():
    """Get learning mode status and statistics"""
    return {
        "learning_enabled": ai_controller.learning_enabled,
        "stats": ai_controller.get_learning_stats()
    }


@app.get("/api/learning/stats/{channel}")
async def get_channel_learning_stats(channel: int):
    """Get learning statistics for a specific channel"""
    return ai_controller.get_learning_stats(channel)


@app.post("/api/learning/save")
async def save_learning_data():
    """Save current learning data to JSON file"""
    try:
        filepath = learning_storage.save_learning_data(ai_controller)
        return {
            "status": "success",
            "message": "Learning data saved",
            "filepath": filepath
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save learning data: {str(e)}")


@app.get("/api/learning/export")
async def export_learning_data():
    """Export learning data as JSON for download"""
    try:
        json_str = learning_storage.export_learning_data_json(ai_controller)
        return {
            "status": "success",
            "data": json.loads(json_str)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export learning data: {str(e)}")


class LearningDataImport(BaseModel):
    data: dict


@app.post("/api/learning/import")
async def import_learning_data(import_data: LearningDataImport):
    """Import learning data from JSON"""
    try:
        json_str = json.dumps(import_data.data)
        success = learning_storage.import_learning_data_json(ai_controller, json_str)

        if success:
            return {
                "status": "success",
                "message": "Learning data imported successfully"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to import learning data")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Import error: {str(e)}")


@app.get("/api/learning/history")
async def get_learning_history():
    """List all saved learning data files"""
    try:
        files = learning_storage.list_learning_files()
        return {
            "status": "success",
            "files": files,
            "count": len(files)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list learning files: {str(e)}")


class LearningFileLoad(BaseModel):
    filename: str


@app.post("/api/learning/load")
async def load_learning_file(load_data: LearningFileLoad):
    """Load learning data from a specific file"""
    try:
        filepath = learning_storage.data_dir / load_data.filename
        success = learning_storage.load_learning_data(ai_controller, str(filepath))

        if success:
            return {
                "status": "success",
                "message": f"Learning data loaded from {load_data.filename}"
            }
        else:
            raise HTTPException(status_code=400, detail="Failed to load learning data")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Load error: {str(e)}")


# ==================== Preset Management ====================

# In-memory preset storage (would be database in production)
presets_storage: Dict[str, dict] = {}


class PresetCreate(BaseModel):
    name: str
    description: str


class PresetApply(BaseModel):
    name: str


@app.post("/api/presets/save")
async def save_preset(preset_data: PresetCreate):
    """Save current mixer configuration as preset"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    # Get current mixer state
    channels = await mixer_adapter.get_all_channels()

    fader_positions = {ch.channel: ch.fader_value for ch in channels}
    mute_states = {ch.channel: ch.muted for ch in channels}

    # Create preset
    preset = ai_controller.create_preset(
        name=preset_data.name,
        description=preset_data.description,
        fader_positions=fader_positions,
        mute_states=mute_states
    )

    # Export to JSON and store
    preset_json = ai_controller.export_preset_json(preset)
    presets_storage[preset_data.name] = json.loads(preset_json)

    return {
        "status": "success",
        "message": f"Preset '{preset_data.name}' saved",
        "preset": {
            "name": preset.name,
            "description": preset.description,
            "created_at": preset.created_at,
            "channels": len(preset.fader_positions)
        }
    }


@app.post("/api/presets/load")
async def load_preset(preset_apply: PresetApply):
    """Load and apply a saved preset"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    if preset_apply.name not in presets_storage:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_apply.name}' not found")

    # Import preset from JSON
    preset_json = json.dumps(presets_storage[preset_apply.name])
    preset = ai_controller.import_preset_json(preset_json)

    # Load AI configuration
    ai_controller.load_preset(preset)

    # Apply fader positions and mute states
    for channel, fader in preset.fader_positions.items():
        await mixer_adapter.set_channel_fader(channel, fader)

    for channel, muted in preset.mute_states.items():
        await mixer_adapter.mute_channel(channel, muted)

    return {
        "status": "success",
        "message": f"Preset '{preset_apply.name}' loaded and applied",
        "preset": {
            "name": preset.name,
            "description": preset.description,
            "channels_configured": len(preset.fader_positions)
        }
    }


@app.get("/api/presets/list")
async def list_presets():
    """List all saved presets"""
    presets_list = [
        {
            "name": data["name"],
            "description": data["description"],
            "created_at": data["created_at"],
            "channels": len(data["fader_positions"])
        }
        for data in presets_storage.values()
    ]

    return {
        "count": len(presets_list),
        "presets": presets_list
    }


@app.delete("/api/presets/{name}")
async def delete_preset(name: str):
    """Delete a saved preset"""
    if name not in presets_storage:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")

    del presets_storage[name]

    return {
        "status": "success",
        "message": f"Preset '{name}' deleted"
    }


@app.get("/api/presets/export/{name}")
async def export_preset(name: str):
    """Export preset as JSON file"""
    if name not in presets_storage:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")

    return presets_storage[name]


@app.post("/api/presets/import")
async def import_preset(preset_data: dict):
    """Import preset from JSON"""
    try:
        preset_json = json.dumps(preset_data)
        preset = ai_controller.import_preset_json(preset_json)

        # Store preset
        presets_storage[preset.name] = preset_data

        return {
            "status": "success",
            "message": f"Preset '{preset.name}' imported",
            "preset": {
                "name": preset.name,
                "description": preset.description,
                "channels": len(preset.fader_positions)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid preset data: {str(e)}")


# ==================== Smart Presets ====================

@app.get("/api/presets/suggest")
async def suggest_presets(top_n: int = 3):
    """Get smart preset suggestions based on current mixer state"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    # Get current channels with stats
    channels = await mixer_adapter.get_all_channels()

    channel_data = [
        {
            "channel": ch.channel,
            "level_db": ch.level_db,
            "fader_value": ch.fader_value,
            "stats": ai_controller.get_channel_stats(ch.channel)
        }
        for ch in channels
    ]

    # Get suggestions
    suggestions = preset_analyzer.suggest_presets(channel_data, top_n=top_n)

    return {
        "status": "success",
        "suggestions": [
            {
                "preset_name": s.preset_name,
                "score": s.score,
                "reasons": s.reasons,
                "recommended": s.recommended,
                "description": preset_analyzer.BUILTIN_PRESETS[s.preset_name]["description"]
            }
            for s in suggestions
        ],
        "mixer_state": preset_analyzer.analyze_mixer_state(channel_data)
    }


class SmartPresetApply(BaseModel):
    preset_name: str
    apply_adjustments: bool = True


@app.post("/api/presets/apply-smart")
async def apply_smart_preset(preset_data: SmartPresetApply):
    """Apply a smart preset with context-aware adjustments"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    # Get preset configuration
    preset_config = preset_analyzer.get_preset_config(preset_data.preset_name)

    if not preset_config:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_data.preset_name}' not found")

    # Update AI controller configuration
    for channel in range(1, mixer_adapter.channels + 1):
        config = ChannelConfig(
            channel=channel,
            max_threshold_db=preset_config["max_threshold_db"],
            target_level_db=preset_config["target_level_db"],
            min_threshold_db=preset_config["min_threshold_db"],
            auto_adjust_enabled=True,
            adjustment_speed=preset_config["adjustment_speed"]
        )
        ai_controller.configure_channel(config)

    # Apply smart adjustments if requested
    adjusted_count = 0

    if preset_data.apply_adjustments:
        # Get current average levels
        channels = await mixer_adapter.get_all_channels()

        current_levels = {}
        for ch in channels:
            stats = ai_controller.get_channel_stats(ch.channel)
            if stats and stats.get('avg_db'):
                current_levels[ch.channel] = stats['avg_db']

        # Calculate adjusted fader positions
        adjusted_faders = preset_analyzer.apply_preset_with_adjustment(
            preset_data.preset_name,
            current_levels
        )

        # Apply fader adjustments
        for channel, fader_value in adjusted_faders.items():
            await mixer_adapter.set_channel_fader(channel, fader_value)
            adjusted_count += 1

    logger.info(f"Applied smart preset: {preset_data.preset_name}, adjusted {adjusted_count} channels")

    return {
        "status": "success",
        "message": f"Preset '{preset_data.preset_name}' applied",
        "preset_config": preset_config,
        "channels_adjusted": adjusted_count
    }


@app.get("/api/presets/builtin")
async def list_builtin_presets():
    """List all built-in smart presets"""
    return {
        "status": "success",
        "presets": {
            name: {
                "description": config["description"],
                "max_threshold_db": config["max_threshold_db"],
                "target_level_db": config["target_level_db"],
                "min_threshold_db": config["min_threshold_db"],
                "adjustment_speed": config["adjustment_speed"]
            }
            for name, config in preset_analyzer.BUILTIN_PRESETS.items()
        }
    }


# ==================== Alert System ====================

@app.get("/api/alerts/history")
async def get_alert_history(limit: Optional[int] = 100):
    """Get alert history"""
    return {
        "status": "success",
        "alerts": alert_engine.get_alert_history(limit=limit),
        "total": len(alert_engine.alert_history)
    }


@app.get("/api/alerts/channel/{channel}")
async def get_channel_alerts(channel: int):
    """Get alerts for specific channel"""
    return {
        "status": "success",
        "channel": channel,
        "alerts": alert_engine.get_alerts_by_channel(channel)
    }


@app.get("/api/alerts/type/{alert_type}")
async def get_alerts_by_type(alert_type: str):
    """Get alerts by type"""
    try:
        alert_type_enum = AlertType(alert_type)
        return {
            "status": "success",
            "type": alert_type,
            "alerts": alert_engine.get_alerts_by_type(alert_type_enum)
        }
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid alert type: {alert_type}")


class AlertConfigUpdate(BaseModel):
    clipping_threshold_db: Optional[float] = None
    clipping_consecutive_samples: Optional[int] = None
    low_signal_threshold_db: Optional[float] = None
    low_signal_duration_sec: Optional[float] = None
    noise_floor_std_dev_threshold: Optional[float] = None
    noise_floor_duration_sec: Optional[float] = None
    sudden_drop_threshold_db: Optional[float] = None
    sudden_drop_time_window_sec: Optional[float] = None
    alert_cooldown_sec: Optional[float] = None


@app.get("/api/alerts/config")
async def get_alert_config():
    """Get current alert configuration"""
    config = alert_engine.config
    return {
        "status": "success",
        "config": {
            "clipping_threshold_db": config.clipping_threshold_db,
            "clipping_consecutive_samples": config.clipping_consecutive_samples,
            "low_signal_threshold_db": config.low_signal_threshold_db,
            "low_signal_duration_sec": config.low_signal_duration_sec,
            "noise_floor_std_dev_threshold": config.noise_floor_std_dev_threshold,
            "noise_floor_duration_sec": config.noise_floor_duration_sec,
            "sudden_drop_threshold_db": config.sudden_drop_threshold_db,
            "sudden_drop_time_window_sec": config.sudden_drop_time_window_sec,
            "alert_cooldown_sec": config.alert_cooldown_sec
        }
    }


@app.post("/api/alerts/config")
async def update_alert_config(config_update: AlertConfigUpdate):
    """Update alert configuration"""
    current_config = alert_engine.config

    # Update only provided fields
    if config_update.clipping_threshold_db is not None:
        current_config.clipping_threshold_db = config_update.clipping_threshold_db
    if config_update.clipping_consecutive_samples is not None:
        current_config.clipping_consecutive_samples = config_update.clipping_consecutive_samples
    if config_update.low_signal_threshold_db is not None:
        current_config.low_signal_threshold_db = config_update.low_signal_threshold_db
    if config_update.low_signal_duration_sec is not None:
        current_config.low_signal_duration_sec = config_update.low_signal_duration_sec
    if config_update.noise_floor_std_dev_threshold is not None:
        current_config.noise_floor_std_dev_threshold = config_update.noise_floor_std_dev_threshold
    if config_update.noise_floor_duration_sec is not None:
        current_config.noise_floor_duration_sec = config_update.noise_floor_duration_sec
    if config_update.sudden_drop_threshold_db is not None:
        current_config.sudden_drop_threshold_db = config_update.sudden_drop_threshold_db
    if config_update.sudden_drop_time_window_sec is not None:
        current_config.sudden_drop_time_window_sec = config_update.sudden_drop_time_window_sec
    if config_update.alert_cooldown_sec is not None:
        current_config.alert_cooldown_sec = config_update.alert_cooldown_sec

    alert_engine.update_config(current_config)

    return {
        "status": "success",
        "message": "Alert configuration updated"
    }


@app.delete("/api/alerts/history")
async def clear_alert_history():
    """Clear all alert history"""
    alert_engine.clear_history()

    return {
        "status": "success",
        "message": "Alert history cleared"
    }


# ==================== Session Recording ====================

class SessionStart(BaseModel):
    name: str
    notes: Optional[str] = None


@app.post("/api/sessions/start")
async def start_session_recording(session_data: SessionStart):
    """Start a new recording session"""
    if not mixer_adapter or not mixer_adapter.connected:
        raise HTTPException(status_code=400, detail="Not connected to mixer")

    mixer_model = mixer_adapter.model if mixer_adapter else "unknown"

    session_id = session_db.start_session(
        name=session_data.name,
        mixer_model=mixer_model,
        notes=session_data.notes
    )

    logger.info(f"Started recording session: {session_data.name} (ID: {session_id})")

    return {
        "status": "success",
        "message": f"Session '{session_data.name}' started",
        "session_id": session_id
    }


@app.post("/api/sessions/{session_id}/stop")
async def stop_session_recording(session_id: int):
    """Stop a recording session"""
    try:
        session_db.end_session(session_id)

        logger.info(f"Stopped recording session ID: {session_id}")

        return {
            "status": "success",
            "message": f"Session {session_id} stopped"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop session: {str(e)}")


@app.get("/api/sessions/list")
async def list_sessions(limit: int = 50):
    """List all recording sessions"""
    sessions = session_db.list_sessions(limit=limit)

    return {
        "status": "success",
        "sessions": sessions,
        "count": len(sessions)
    }


@app.get("/api/sessions/{session_id}/stats")
async def get_session_stats(session_id: int):
    """Get statistics for a session"""
    stats = session_db.get_session_stats(session_id)

    if not stats:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")

    return {
        "status": "success",
        "stats": stats
    }


@app.get("/api/sessions/{session_id}/export")
async def export_session_csv(session_id: int):
    """Export session data as CSV"""
    try:
        csv_data = session_db.export_session_csv(session_id)

        from fastapi.responses import Response

        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=session_{session_id}.csv"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int):
    """Delete a session"""
    try:
        session_db.delete_session(session_id)

        logger.info(f"Deleted session ID: {session_id}")

        return {
            "status": "success",
            "message": f"Session {session_id} deleted"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


@app.post("/api/sessions/cleanup")
async def cleanup_old_sessions(days: int = 30):
    """Clean up sessions older than specified days"""
    deleted_count = session_db.cleanup_old_sessions(days=days)

    return {
        "status": "success",
        "message": f"Cleaned up {deleted_count} old sessions",
        "deleted_count": deleted_count
    }


@app.websocket("/ws/meters")
async def websocket_meters(websocket: WebSocket):
    """WebSocket for real-time meter updates and AI control"""
    await websocket.accept()
    active_websockets.append(websocket)

    try:
        while True:
            if not mixer_adapter or not mixer_adapter.connected:
                await websocket.send_json({
                    "error": "Not connected to mixer",
                    "timestamp": time.time()
                })
                await asyncio.sleep(1)
                continue

            channels = await mixer_adapter.get_all_channels()
            decisions = []
            alerts = []

            # Prepare channel data for session recording
            channel_data = [
                {
                    "channel": ch.channel,
                    "level_db": ch.level_db,
                    "fader_value": ch.fader_value,
                    "muted": ch.muted
                }
                for ch in channels
            ]

            # Check for alerts on all channels
            for ch in channels:
                stats = ai_controller.get_channel_stats(ch.channel)
                channel_alerts = alert_engine.check_for_alerts(
                    channel=ch.channel,
                    current_db=ch.level_db,
                    stats=stats,
                    sample_rate_hz=1000 / settings.ws_refresh_rate_ms
                )
                alerts.extend(channel_alerts)

            if ai_enabled:
                # Collect AI decisions and batch fader updates
                batch_fader_updates = {}

                for ch in channels:
                    if ch.level_db > -60:
                        decision = ai_controller.analyze_level(ch.channel, ch.level_db)

                        # Apply learned behavior if learning is enabled
                        if ai_controller.learning_enabled:
                            decision = ai_controller.apply_learned_behavior(ch.channel, decision)

                        if decision.action == 'reduce' or decision.action == 'increase':
                            if decision.suggested_fader is not None:
                                # Accumulate for batch send
                                batch_fader_updates[ch.channel] = decision.suggested_fader

                                decisions.append({
                                    "channel": decision.channel,
                                    "action": decision.action,
                                    "current_level": decision.current_level_db,
                                    "new_fader": decision.suggested_fader,
                                    "reason": decision.reason,
                                    "urgency": decision.urgency,
                                    "confidence": decision.confidence
                                })

                # Send batch OSC updates if we have multiple adjustments
                if batch_fader_updates:
                    if len(batch_fader_updates) > 1:
                        # Use batch for efficiency
                        await mixer_adapter.set_channel_fader_batch(batch_fader_updates)
                        logger.debug(f"Batch updated {len(batch_fader_updates)} channels")
                    else:
                        # Single update, use regular method
                        channel, value = list(batch_fader_updates.items())[0]
                        await mixer_adapter.set_channel_fader(channel, value)

            # Sanitize values for JSON serialization
            def sanitize_number(value):
                """Convert inf/-inf/nan to valid JSON numbers"""
                import math
                if value is None:
                    return None
                if math.isinf(value):
                    return -60.0 if value < 0 else 0.0
                if math.isnan(value):
                    return None
                return float(value)

            def sanitize_stats(stats):
                """Sanitize all stats values"""
                if not stats:
                    return None
                return {
                    "samples": stats.get("samples", 0),
                    "avg_db": sanitize_number(stats.get("avg_db")),
                    "max_db": sanitize_number(stats.get("max_db")),
                    "min_db": sanitize_number(stats.get("min_db")),
                    "std_dev": sanitize_number(stats.get("std_dev")),
                    "recent_peak": sanitize_number(stats.get("recent_peak"))
                }

            # Build the message
            message = {
                "timestamp": time.time(),
                "ai_enabled": ai_enabled,
                "channels": [
                    {
                        "channel": ch.channel,
                        "name": ch.name,
                        "level_db": sanitize_number(ch.level_db),
                        "fader_value": sanitize_number(ch.fader_value),
                        "muted": ch.muted,
                        "stats": sanitize_stats(ai_controller.get_channel_stats(ch.channel))
                    }
                    for ch in channels
                ],
                "ai_decisions": decisions,
                "alerts": [
                    {
                        "alert_id": alert.alert_id,
                        "type": alert.alert_type.value,
                        "severity": alert.severity.value,
                        "channel": alert.channel,
                        "message": alert.message,
                        "suggested_action": alert.suggested_action
                    }
                    for alert in alerts
                ]
            }

            # Test JSON serialization before sending
            try:
                import json
                json_str = json.dumps(message)
                await websocket.send_text(json_str)
            except (ValueError, TypeError) as e:
                print(f"\n{'='*60}")
                print(f"JSON SERIALIZATION ERROR!")
                print(f"Error: {e}")
                print(f"Message preview: {str(message)[:500]}")
                print(f"{'='*60}\n")
                # Send error message instead
                await websocket.send_json({
                    "error": "Serialization error",
                    "timestamp": time.time()
                })

            # Record frame if session is active
            if session_db.current_session_id:
                session_db.record_frame(
                    session_id=session_db.current_session_id,
                    channels=channel_data,
                    ai_decisions=decisions
                )

            await asyncio.sleep(settings.ws_refresh_rate_ms / 1000)

    except WebSocketDisconnect:
        if websocket in active_websockets:
            active_websockets.remove(websocket)
        logger.info("WebSocket client disconnected")
    except Exception as e:
        import traceback
        error_msg = f"WebSocket error: {type(e).__name__}: {str(e)}"
        print(f"\n{'='*60}")
        print(f"WEBSOCKET ERROR!")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print(f"Traceback:")
        traceback.print_exc()
        print(f"{'='*60}\n")
        logger.error(error_msg, exc_info=True)
        if websocket in active_websockets:
            active_websockets.remove(websocket)


@app.on_event("startup")
async def startup_event():
    """Application startup"""
    print(f"XR18 AI Controller started on http://{settings.host}:{settings.port}")
    print(f"AI enabled: {ai_enabled}")


@app.on_event("shutdown")
async def shutdown_event():
    """Application shutdown"""
    global mixer_adapter

    if mixer_adapter:
        await mixer_adapter.disconnect()

    print("XR18 AI Controller stopped")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.reload,
        log_level=settings.log_level.lower()
    )
