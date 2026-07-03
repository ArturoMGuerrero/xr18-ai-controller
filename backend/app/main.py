"""Main FastAPI application for XR18 AI Controller"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict
import asyncio
import time

from .config import settings
from .adapters import BehringerAdapter
from .ai_controller import AIAudioController, ChannelConfig, AIDecision

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

    success = await mixer_adapter.set_channel_fader(control.channel, control.value)

    if success:
        return {
            "status": "success",
            "channel": control.channel,
            "value": control.value
        }
    else:
        raise HTTPException(status_code=500, detail="Failed to set fader")


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
