# Voz de narrador joven y con energía (Kokoro-82M, licencia Apache 2.0).
import json, os, soundfile as sf, numpy as np
from kokoro import KPipeline
LINES = [
 "¡Tío, para! ¿Sabías que puedes ver la tienda de Fórtnait sin abrir el juego?",
 "Se llama Drop Stats, ¡y es una pasada!",
 "Tienes la tienda de hoy entera, con todos los precios en pavos.",
 "Tocas una esquin y te dice cuándo se va. Así no se te escapa ninguna.",
 "El catálogo entero, y ves al momento si está hoy a la venta.",
 "En el mapa marcas dónde caes, ¡y te dibujas la ruta con el dedo! Brutal.",
 "Guardas tus favoritas, miras tus estadísticas, y todo se queda en tu cuenta.",
 "¿Y lo mejor? ¡Es gratis! Drop Stats, punto vércel, punto app.",
]
os.makedirs("out/tts", exist_ok=True)
pipe = KPipeline(lang_code="e")
meta = {}
for voice, speed in [("em_alex", 1.12), ("em_alex", 1.2), ("em_santa", 1.12)]:
    tag = f"{voice}_{int(speed*100)}"; meta[tag] = []
    for i, line in enumerate(LINES):
        audio = np.concatenate([a for _, _, a in pipe(line, voice=voice, speed=speed)])
        fn = f"out/tts/{tag}_{i}.wav"; sf.write(fn, audio, 24000)
        meta[tag].append({"i": i, "dur": len(audio) / 24000})
        print(tag, i, round(len(audio) / 24000, 2), flush=True)
json.dump({"lines": LINES, "takes": meta}, open("out/tts/meta.json", "w"), ensure_ascii=False, indent=1)
