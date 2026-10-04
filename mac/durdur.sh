#!/bin/zsh
# Mac uygulamasının başlattığı CourseKeeper sunucusunu durdurur (uygulamadan çıkınca çağrılır).
# Sadece uygulamanın kendi başlattığı sunucuya dokunur; baslat.command ile açılmış olana dokunmaz.

PROJE="$(cd "$(dirname "$0")/.." && pwd)"
PID_DOSYASI="$PROJE/.coursekeeper.pid"

if [ -f "$PID_DOSYASI" ]; then
    PID="$(cat "$PID_DOSYASI")"
    # Yalnızca gerçekten bizim sunucumuzsa (python ... app.py) durdur.
    if ps -p "$PID" -o command= 2>/dev/null | grep -q "app.py"; then
        kill "$PID" 2>/dev/null
    fi
    rm -f "$PID_DOSYASI"
fi
exit 0
