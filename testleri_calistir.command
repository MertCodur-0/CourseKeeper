#!/bin/zsh
# CourseKeeper'ın testlerini çalıştırır (gerçek veritabanına dokunmaz). Çift tıklayarak da açılır.
#   tests/test_app.py       : sunucu (ders doğrulama, puan sınırları, dönem, otomatik yedek)
#   tests/hesaplar.test.js  : tarayıcıdaki hesaplar (not, harf, GPA, devamsızlık); Node.js gerekir

cd "$(dirname "$0")"

echo "== Sunucu testleri =="
venv/bin/python -m unittest discover tests || sonuc=1

echo ""
echo "== Hesap testleri =="
node --test tests/hesaplar.test.js || sonuc=1

echo ""
if [ -n "$sonuc" ]; then echo "Bazı testler başarısız."; exit 1; fi
echo "Bütün testler geçti."
