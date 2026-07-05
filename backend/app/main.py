"""Main FastAPI application for XR18 AI Controller"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import asyncio
import time
import json

from .config import settings
from .adapters import BehringerAdapter
from .ai_controller import AIAudioController, ChannelConfig, AIDecision
from .storage.learning_storage import LearningStorage
from .services.logger import setup_logging, get_logger

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


# Pydantic models
class ConnectionConfig(BaseModel):
    mixer_model: str = "xr18"  # xr18, x32, m32
    ip_address: str
    port: Optional[int] = None


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
    """Connect to mixer"""
    global mixer_adapter

    try:
        if mixer_adapter and mixer_adapter.connected:
            await mixer_adapter.disconnect()

        mixer_adapter = BehringerAdapter(model=config.mixer_model)
        success = await mixer_adapter.connect(config.ip_address, config.port)

        if success:
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
        raise HTTPException(status_code=500, detail=str(e))


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

    if not ai_enabled:
        ai_controller.reset_all()

    return {
        "ai_enabled": ai_enabled,
        "message": "AI mode " + ("enabled" if ai_enabled else "disabled")
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

        # Apply fader change
        success = await mixer_adapter.set_channel_fader(control.channel, control.value)

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
                "learning_recorded": ai_controller.learning_enabled
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

    success = await mixer_adapter.mute_channel(control.channel, control.mute)

    if success:
        return {
            "status": "success",
            "channel": control.channel,
            "muted": control.mute
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

            if ai_enabled:
                for ch in channels:
                    if ch.level_db > -60:
                        decision = ai_controller.analyze_level(ch.channel, ch.level_db)

                        # Apply learned behavior if learning is enabled
                        if ai_controller.learning_enabled:
                            decision = ai_controller.apply_learned_behavior(ch.channel, decision)

                        if decision.action == 'reduce' or decision.action == 'increase':
                            if decision.suggested_fader is not None:
                                await mixer_adapter.set_channel_fader(
                                    ch.channel,
                                    decision.suggested_fader
                                )

                                decisions.append({
                                    "channel": decision.channel,
                                    "action": decision.action,
                                    "current_level": decision.current_level_db,
                                    "new_fader": decision.suggested_fader,
                                    "reason": decision.reason,
                                    "urgency": decision.urgency,
                                    "confidence": decision.confidence
                                })

            await websocket.send_json({
                "timestamp": time.time(),
                "ai_enabled": ai_enabled,
                "channels": [
                    {
                        "channel": ch.channel,
                        "name": ch.name,
                        "level_db": ch.level_db,
                        "fader_value": ch.fader_value,
                        "muted": ch.muted,
                        "stats": ai_controller.get_channel_stats(ch.channel)
                    }
                    for ch in channels
                ],
                "ai_decisions": decisions
            })

            await asyncio.sleep(settings.ws_refresh_rate_ms / 1000)

    except WebSocketDisconnect:
        active_websockets.remove(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
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
