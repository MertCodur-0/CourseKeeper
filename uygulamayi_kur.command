#!/bin/zsh
# CourseKeeper'ı simgesiyle birlikte bir Mac uygulaması olarak kurar.
# Çift tıkla: Uygulamalar klasörüne CourseKeeper.app oluşturur ve masaüstüne kısayolunu koyar.
# Proje klasörünü taşırsan ya da adını değiştirirsen bunu yeniden çalıştır.

cd "$(dirname "$0")"
PROJE="$(pwd)"

if [ -w "/Applications" ]; then
    HEDEF="/Applications"
else
    HEDEF="$HOME/Applications"
    mkdir -p "$HEDEF"
fi
UYGULAMA="$HEDEF/CourseKeeper.app"

echo "CourseKeeper uygulaması oluşturuluyor..."

# Eski sürüm açıksa kapat, sonra sil.
if pgrep -f "CourseKeeper.app/Contents/MacOS" >/dev/null; then
    osascript -e 'tell application "CourseKeeper" to quit' >/dev/null 2>&1
    sleep 1
fi
rm -rf "$UYGULAMA"

# AppleScript'e proje klasörünün yerini yaz ve uygulamaya çevir (-s: Dock'ta açık kalır).
GECICI="$(mktemp -t coursekeeper).applescript"
ICERIK="$(<mac/CourseKeeper.applescript)"
print -r -- "${ICERIK//__PROJE__/$PROJE}" > "$GECICI"
if ! osacompile -s -o "$UYGULAMA" "$GECICI"; then
    echo "Uygulama oluşturulamadı."
    exit 1
fi
rm -f "$GECICI"

# Simge ve uygulama bilgileri.
cp mac/AppIcon.icns "$UYGULAMA/Contents/Resources/applet.icns"
PLIST="$UYGULAMA/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.mertcodur.coursekeeper" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.mertcodur.coursekeeper" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :CFBundleName CourseKeeper" "$PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :CFBundleName string CourseKeeper" "$PLIST"

# Simge değişince imza bozulur; bu Mac için yeniden imzala, sonra Finder simgeyi yenilesin.
codesign --force --deep --sign - "$UYGULAMA" >/dev/null 2>&1
touch "$UYGULAMA"

chmod +x mac/arka_planda_baslat.sh mac/durdur.sh

# Masaüstü kısayolu.
ln -sfn "$UYGULAMA" "$HOME/Desktop/CourseKeeper.app"

echo ""
echo "Hazır: $UYGULAMA"
echo "Masaüstüne kısayol eklendi. Dock'ta tutmak için uygulamayı Dock'a sürükle."
open -R "$UYGULAMA"
