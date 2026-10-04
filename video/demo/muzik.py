"""Tanıtım videosu için arka plan müziği üretir (telifsiz, tamamen bu betikle sentezlenir).

Sakin bir ambient parça: yumuşak pad akorları, hafif piyano arpejleri ve derin bas.
Akor yürüyüşü: Dmaj7 - Bm7 - Gmaj7 - Asus4/A, 76 BPM.

Kullanım: python muzik.py <süre saniye> <çıktı.wav>
"""

import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, sosfilt

SR = 44100
BPM = 76
VURUS = 60 / BPM
OLCU = 4 * VURUS
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# (pad sesleri, bas notası, arpej notaları)
AKORLAR = [
    ([50, 57, 61, 66], 38, [62, 69, 66, 73, 69, 66]),  # Dmaj7
    ([47, 54, 57, 62], 35, [59, 66, 62, 69, 66, 62]),  # Bm7
    ([43, 50, 54, 59], 31, [55, 62, 59, 66, 62, 59]),  # Gmaj7
    ([45, 52, 57, 62], 33, [57, 64, 62, 69, 64, 61]),  # Asus4 -> A (son nota C#)
]


def zarf(n, atak, birakma):
    e = np.ones(n)
    a = min(int(atak * SR), n)
    r = min(int(birakma * SR), n - a)
    e[:a] = np.linspace(0, 1, a) ** 2
    if r > 0:
        e[n - r:] *= np.linspace(1, 0, r) ** 2
    return e


def pad_notasi(midi, sure):
    n = int(sure * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    ses = np.zeros(n)
    # Biraz ayrık iki ses (chorus) + yumuşak harmonikler: sıcak bir pad.
    for detune in (-0.12, 0.12):
        ff = f * 2 ** (detune / 12)
        for h, amp in ((1, 1.0), (2, 0.35), (3, 0.12), (4, 0.05)):
            ses += amp * np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 2 * np.pi))
    titresim = 1 + 0.06 * np.sin(2 * np.pi * 0.18 * t + rng.uniform(0, 6))
    return ses * titresim * zarf(n, 1.1, 1.4)


def piyano_notasi(midi, hiz):
    sure = 2.6
    n = int(sure * SR)
    t = np.arange(n) / SR
    f = hz(midi)
    ses = (np.sin(2 * np.pi * f * t) * np.exp(-t / 1.1)
           + 0.28 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.45)
           + 0.08 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.25))
    atak = int(0.006 * SR)
    ses[:atak] *= np.linspace(0, 1, atak)
    return ses * hiz


def bas_notasi(midi, sure):
    n = int(sure * SR)
    t = np.arange(n) / SR
    ses = np.sin(2 * np.pi * hz(midi) * t) + 0.15 * np.sin(2 * np.pi * 2 * hz(midi) * t)
    return ses * zarf(n, 0.25, 0.9)


def ekle(iz, parca, bas):
    i = int(bas * SR)
    j = min(len(iz), i + len(parca))
    if i < len(iz):
        iz[i:j] += parca[: j - i]


def yap(toplam):
    n = int((toplam + 4) * SR)
    pad, piyano, bas = np.zeros(n), np.zeros(n), np.zeros(n)
    olcu_sayisi = int(np.ceil(toplam / OLCU)) + 1
    for o in range(olcu_sayisi):
        sesler, kok, arpej = AKORLAR[o % len(AKORLAR)]
        t0 = o * OLCU
        for m in sesler:
            ekle(pad, pad_notasi(m, OLCU + 1.2), t0)
        ekle(bas, bas_notasi(kok + 12, OLCU * 0.95), t0)
        if o == 0:
            continue  # ilk ölçü sadece pad: sakin bir giriş
        # Sekizlik arpej, hafif insansı zamanlama ve vuruş gücü farkı.
        for adim in range(8):
            nota = arpej[adim % len(arpej)]
            if o % 4 == 3 and adim >= 6:
                nota = 61  # A akorunda sus4 -> majör çözülme
            hiz = (0.55 if adim % 2 == 0 else 0.38) * rng.uniform(0.85, 1.0)
            ekle(piyano, piyano_notasi(nota + 12, hiz * 0.8), t0 + adim * VURUS / 2 + rng.normal(0, 0.006))

    # Filtreler: pad yumuşak (alçak geçiren), bas temiz.
    pad = sosfilt(butter(2, 1800, "low", fs=SR, output="sos"), pad)
    piyano = sosfilt(butter(2, 5200, "low", fs=SR, output="sos"), piyano)
    karisim = 0.16 * pad + 0.22 * piyano + 0.20 * bas
    # Çok alçak frekansları at: telefon/laptop hoparlöründe uğultu yapmasın.
    karisim = sosfilt(butter(2, 70, "high", fs=SR, output="sos"), karisim)

    # Yankı (reverb): üstel sönen gürültüyle evrişim, stereo için iki ayrı tepki.
    ir_n = int(3.2 * SR)
    ir_t = np.arange(ir_n) / SR
    stereo = []
    for kanal in range(2):
        ir = rng.normal(0, 1, ir_n) * np.exp(-ir_t / 0.9)
        ir = sosfilt(butter(1, 3500, "low", fs=SR, output="sos"), ir)
        ir /= np.sqrt(np.sum(ir ** 2))
        islak = fftconvolve(karisim, ir)[:n]
        stereo.append(0.72 * karisim + 0.45 * islak)
    ses = np.stack(stereo, axis=1)[: int(toplam * SR)]
    ses = sosfilt(butter(4, 75, "high", fs=SR, output="sos"), ses, axis=0)

    # Giriş ve çıkış geçişleri, sonra seviyeyi ayarla (tepe -3 dBFS).
    gir, cik = int(1.8 * SR), int(3.0 * SR)
    ses[:gir] *= np.linspace(0, 1, gir)[:, None] ** 2
    ses[-cik:] *= np.linspace(1, 0, cik)[:, None] ** 1.5
    ses *= 10 ** (-3 / 20) / np.max(np.abs(ses))
    return ses


if __name__ == "__main__":
    sure = float(sys.argv[1]) if len(sys.argv) > 1 else 34
    cikti = sys.argv[2] if len(sys.argv) > 2 else "music.wav"
    sf.write(cikti, yap(sure), SR)
    print("yazıldı:", cikti)
