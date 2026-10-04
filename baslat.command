#!/bin/zsh
# CourseKeeper'ı başlatır: çift tıklayınca sunucu açılır ve tarayıcıda uygulama görünür.

# Bu dosyanın bulunduğu klasöre (proje klasörüne) geç.
cd "$(dirname "$0")"

# Sanal ortam yoksa oluştur.
if [ ! -d "venv" ]; then
    echo "Sanal ortam oluşturuluyor..."
    python3 -m venv venv
fi

# Gerekli paketleri kur (zaten kuruluysa hızlıca geçer).
venv/bin/pip install --quiet -r requirements.txt

# Sunucu açılınca tarayıcıyı aç (2 saniye bekleyip).
(sleep 2 && open "http://127.0.0.1:5001") &

echo "CourseKeeper çalışıyor: http://127.0.0.1:5001"
echo "Kapatmak için bu pencerede Ctrl+C'ye bas."
venv/bin/python app.py
