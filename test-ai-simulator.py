#!/usr/bin/env python3
"""
Simulador de IA para entender cómo funciona
NO requiere consola física
"""

import sys
import time
sys.path.insert(0, 'backend')

from app.ai_controller import AIAudioController, ChannelConfig

def simulate_ai_decisions():
    """Simula diferentes escenarios y muestra decisiones de IA"""

    print("=" * 60)
    print("🤖 SIMULADOR DE IA - XR18 AI Controller")
    print("=" * 60)
    print()
    print("Voy a simular diferentes niveles de audio y mostrarte")
    print("exactamente qué haría la IA en cada caso.")
    print()

    # Crear controlador IA
    ai = AIAudioController(history_window=100)

    # Configurar canal
    config = ChannelConfig(
        channel=1,
        max_threshold_db=-6.0,
        target_level_db=-12.0,
        min_threshold_db=-40.0,
        auto_adjust_enabled=True
    )
    ai.configure_channel(config)

    print("Configuración:")
    print(f"  Max Threshold: {config.max_threshold_db} dB")
    print(f"  Target Level:  {config.target_level_db} dB")
    print(f"  Min Threshold: {config.min_threshold_db} dB")
    print()
    print("-" * 60)

    # Escenarios
    scenarios = [
        {
            "name": "1️⃣  Persona hablando normal",
            "levels": [-25, -28, -26, -24, -27, -25, -26, -25, -28, -26] * 3,
            "description": "Voz conversacional"
        },
        {
            "name": "2️⃣  Cantante aumentando volumen",
            "levels": [-20, -18, -15, -12, -10, -8, -7, -6, -5, -4],
            "description": "Crescendo musical"
        },
        {
            "name": "3️⃣  Grito súbito (peligro!)",
            "levels": [-25, -25, -25, -25, -2, -2, -3, -25, -25, -25],
            "description": "Pico extremo"
        },
        {
            "name": "4️⃣  Señal muy baja",
            "levels": [-50, -52, -48, -51, -49, -50, -51, -52, -48, -50],
            "description": "Micrófono muy lejos"
        },
        {
            "name": "5️⃣  Música dinámica",
            "levels": [-30, -15, -35, -10, -40, -8, -35, -12, -30, -15],
            "description": "Rock/pop con variación"
        }
    ]

    for scenario in scenarios:
        print()
        print(f"\n{'=' * 60}")
        print(f"{scenario['name']}")
        print(f"Descripción: {scenario['description']}")
        print("=" * 60)

        # Feed levels
        for i, level in enumerate(scenario['levels']):
            decision = ai.analyze_level(1, level)

            # Mostrar solo cuando hay acción
            if decision.action != 'maintain' or i == len(scenario['levels']) - 1:
                print(f"\nSample {i+1}/{len(scenario['levels'])}")
                print(f"  📊 Nivel actual: {level:.1f} dB")
                print(f"  🎯 Acción: {decision.action.upper()}")
                print(f"  ⚠️  Urgencia: {decision.urgency.upper()}")
                print(f"  📈 Confianza: {decision.confidence*100:.0f}%")
                print(f"  💬 Razón: {decision.reason}")

                if decision.suggested_fader is not None:
                    print(f"  🎚️  Nuevo fader: {decision.suggested_fader:.3f}")
                    print(f"      (cambiaría de 0.750 a {decision.suggested_fader:.3f})")

        # Estadísticas finales
        stats = ai.get_channel_stats(1)
        print(f"\n📊 Estadísticas del escenario:")
        print(f"  Promedio: {stats['avg_db']:.1f} dB")
        print(f"  Máximo:   {stats['max_db']:.1f} dB")
        print(f"  Mínimo:   {stats['min_db']:.1f} dB")
        print(f"  Variación: {stats['std_dev']:.1f} dB")

        # Reset para siguiente escenario
        ai.reset_channel(1)
        ai.configure_channel(config)

        input("\nPresiona ENTER para siguiente escenario...")

    print("\n" + "=" * 60)
    print("✅ Simulación completa")
    print("=" * 60)
    print()
    print("Así es exactamente como la IA analiza y responde")
    print("cuando conectas tu mixer real.")
    print()


if __name__ == "__main__":
    try:
        simulate_ai_decisions()
    except KeyboardInterrupt:
        print("\n\n👋 Simulación cancelada")
