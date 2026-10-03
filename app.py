import sqlite3
from datetime import date, timedelta
from pathlib import Path

from flask import Flask, render_template

# Veritabanı dosyası proje klasöründe durur.
PROJE_KLASORU = Path(__file__).parent
VERITABANI_DOSYASI = PROJE_KLASORU / "derstakip.db"

# 5000 portunu Mac'te AirPlay kullandığı için 5001'i seçtik.
PORT = 5001

# Takvimdeki günler (Pazartesi başlangıçlı). Gün listesi sadece burada tanımlı.
GUNLER = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]

# Takvimdeki saat satırları: 09, 10, ... 20 (12 satır, son satır 21:00'de biter).
ILK_SAAT = 9
SON_SAAT = 21

app = Flask(__name__)


def bu_haftanin_gunleri(bugun):
    """Bugünün içinde olduğu haftanın 7 gününü (Pazartesi'den Pazar'a) döndürür."""
    # weekday(): Pazartesi 0, Pazar 6. Bu kadar gün geri gidince Pazartesi'yi buluruz.
    pazartesi = bugun - timedelta(days=bugun.weekday())
    gunler = []
    for sira, kisaltma in enumerate(GUNLER):
        tarih = pazartesi + timedelta(days=sira)
        gunler.append({
            "kisaltma": kisaltma,
            "ayin_gunu": tarih.day,
            "bugun_mu": tarih == bugun,
        })
    return gunler


def veritabani_baglan():
    """SQLite veritabanına bir bağlantı açar."""
    baglanti = sqlite3.connect(VERITABANI_DOSYASI)
    # Satırlara sütun adıyla erişebilmek için (ör. satir["ad"]).
    baglanti.row_factory = sqlite3.Row
    return baglanti


def veritabani_hazirla():
    """Veritabanı dosyasını (yoksa) oluşturur. Tablolar ileride buraya eklenecek."""
    baglanti = veritabani_baglan()
    baglanti.close()


@app.route("/")
def ana_sayfa():
    bugun = date.today()
    return render_template(
        "index.html",
        bugun_yazisi=bugun.strftime("%d/%m"),
        gunler=bu_haftanin_gunleri(bugun),
        saatler=range(ILK_SAAT, SON_SAAT),
        ilk_saat=ILK_SAAT,
    )


if __name__ == "__main__":
    veritabani_hazirla()
    # 127.0.0.1: uygulamaya sadece bu Mac'ten erişilebilir.
    app.run(host="127.0.0.1", port=PORT, debug=True)
