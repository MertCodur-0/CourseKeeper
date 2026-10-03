import sqlite3
from pathlib import Path

from flask import Flask, render_template

# Veritabanı dosyası proje klasöründe durur.
PROJE_KLASORU = Path(__file__).parent
VERITABANI_DOSYASI = PROJE_KLASORU / "derstakip.db"

# 5000 portunu Mac'te AirPlay kullandığı için 5001'i seçtik.
PORT = 5001

app = Flask(__name__)


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
    return render_template("index.html")


if __name__ == "__main__":
    veritabani_hazirla()
    # 127.0.0.1: uygulamaya sadece bu Mac'ten erişilebilir.
    app.run(host="127.0.0.1", port=PORT, debug=True)
