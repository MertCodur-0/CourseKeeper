"""Videonun İngilizce anlatımını (kadın sesi) üretir: açık kaynak Kokoro modeliyle, internete gerek olmadan.

Gerekenler:
  pip install kokoro-onnx soundfile
  Model dosyaları (https://github.com/thewh1teagle/kokoro-onnx/releases, "model-files-v1.0"):
    kokoro-v1.0.onnx ve voices-v1.0.bin  -> bu klasöre (video/demo) koy (git'e eklenmez)

Kullanım: python video/demo/anlatim.py
Satırlar video/public/audio/narration/<sahne>.wav olarak yazılır, süreler ekrana basılır.
Metni değiştirirsen video/src/Promo.tsx içindeki NARRATION sürelerini de güncelle.
"""

import json
import sys
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

SATIRLAR = {
    "intro": "Meet CourseKeeper.",
    "calendar": "Your whole week, gathered in one calm place.",
    "syllabus": "Drop in a syllabus, and Gemini fills in the details, gently flagging anything it isn't sure about.",
    "grades": "Choose a target grade, and see exactly what you need on the exams ahead.",
    "attendance": "Attendance is tracked hour by hour, with a quiet warning before you reach your limit.",
    "gpa": "Plan your GPA with confidence.",
    "theme": "In light, or in dark.",
    "end": "CourseKeeper. Your semester, beautifully kept.",
}
SES = "af_heart"    # sıcak, doğal bir kadın sesi (Kokoro'nun en kaliteli sesi)
HIZ = 0.92          # biraz yavaş: sakin ve zarif bir anlatım

BURASI = Path(__file__).resolve().parent
CIKTI = BURASI.parent / "public" / "audio" / "narration"

if __name__ == "__main__":
    model_klasoru = Path(sys.argv[1]) if len(sys.argv) > 1 else BURASI
    CIKTI.mkdir(parents=True, exist_ok=True)
    k = Kokoro(str(model_klasoru / "kokoro-v1.0.onnx"), str(model_klasoru / "voices-v1.0.bin"))
    sureler = {}
    for ad, metin in SATIRLAR.items():
        ornek, sr = k.create(metin, voice=SES, speed=HIZ, lang="en-us")
        sf.write(CIKTI / f"{ad}.wav", ornek, sr)
        sureler[ad] = round(len(ornek) / sr, 2)
    print(json.dumps(sureler, indent=2))
