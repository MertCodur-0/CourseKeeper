-- CourseKeeper.app: uygulamayi_kur.command bu dosyadan Mac uygulamasını oluşturur.
-- Açılınca sunucuyu arka planda başlatıp tarayıcıyı açar, Dock'ta durur;
-- Dock'taki simgeye tekrar tıklayınca tarayıcıyı yeniden açar; çıkınca (⌘Q) sunucuyu durdurur.

property projeKlasoru : "__PROJE__"

on run
	try
		do shell script quoted form of (projeKlasoru & "/mac/arka_planda_baslat.sh")
	on error hataMesaji
		display dialog "CourseKeeper açılamadı." & return & return & hataMesaji with title "CourseKeeper" buttons {"Tamam"} default button 1 with icon caution
		tell me to quit
	end try
end run

on reopen
	do shell script quoted form of (projeKlasoru & "/mac/arka_planda_baslat.sh")
end reopen

on idle
	return 300
end idle

on quit
	try
		do shell script quoted form of (projeKlasoru & "/mac/durdur.sh")
	end try
	continue quit
end quit
