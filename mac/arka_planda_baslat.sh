#!/bin/zsh
# CourseKeeper'ı arka planda başlatır ve tarayıcıda açar. Mac uygulaması (CourseKeeper.app) bunu çağırır.
# Zaten çalışıyorsa sadece tarayıcıyı açar. Sunucunun kayıtları: ~/Library/Logs/CourseKeeper.log

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
PROJE="$(cd "$(dirname "$0")/.." && pwd)"
ADRES="http://127.0.0.1:5001"
GUNLUK="$HOME/Library/Logs/CourseKeeper.log"
PID_DOSYASI="$PROJE/.coursekeeper.pid"

calisiyor_mu() { curl -s -o /dev/null --max-time 1 "$ADRES"; }

if calisiyor_mu; then
    open "$ADRES"
    exit 0
fi

cd "$PROJE" || exit 1
echo "--- $(date '+%Y-%m-%d %H:%M:%S') başlatılıyor" >> "$GUNLUK"

# Sanal ortam yoksa oluştur; paketleri sadece requirements.txt değiştiyse yeniden kur (açılış hızlı olsun).
if [ ! -x venv/bin/python ]; then
    python3 -m venv venv >> "$GUNLUK" 2>&1 || { echo "Python sanal ortamı oluşturulamadı." >&2; exit 1; }
fi
if [ ! -f venv/.kuruldu ] || [ requirements.txt -nt venv/.kuruldu ]; then
    venv/bin/python -m pip install --quiet -r requirements.txt >> "$GUNLUK" 2>&1 \
        || { echo "Gerekli paketler kurulamadı (internet bağlantını kontrol et)." >&2; exit 1; }
    touch venv/.kuruldu
fi

# Günlük kullanım: geliştirici modu kapalı. Sunucu bu betikten bağımsız çalışmaya devam eder.
COURSEKEEPER_DEBUG=0 nohup venv/bin/python app.py < /dev/null >> "$GUNLUK" 2>&1 &
echo $! > "$PID_DOSYASI"

# Sunucu hazır olunca tarayıcıyı aç (en fazla 30 saniye bekle).
for i in {1..60}; do
    if calisiyor_mu; then
        open "$ADRES"
        exit 0
    fi
    if ! kill -0 "$(cat "$PID_DOSYASI")" 2>/dev/null; then
        echo "CourseKeeper başlatılamadı. Ayrıntılar: ~/Library/Logs/CourseKeeper.log" >&2
        rm -f "$PID_DOSYASI"
        exit 1
    fi
    sleep 0.5
done
echo "CourseKeeper zamanında açılmadı. Ayrıntılar: ~/Library/Logs/CourseKeeper.log" >&2
exit 1
