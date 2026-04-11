npm run build

adb shell "mountpoint /usr/share/qt-superbird-app/webapp/ > /dev/null && umount /usr/share/qt-superbird-app/webapp"
adb shell "rm -rf /tmp/webapp"
adb push dist /tmp/webapp
adb shell "mount --bind /tmp/webapp /usr/share/qt-superbird-app/webapp"
adb shell "supervisorctl restart chromium"