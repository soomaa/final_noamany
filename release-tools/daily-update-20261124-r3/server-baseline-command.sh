# Read-only: prints the hashes 24-r3 is built against. Changes nothing, prints no secrets.
(
cd /home/noamanycenter/final.noamanycenter.com || exit 1
norm(){ sed -e 's/\r$//' -e '/^\/\/# sourceMappingURL=/d' "$1" | sha256sum | cut -d' ' -f1; }
W=modules/whatsapp-campaigns
for f in $W/wa-control.client.js $W/wa-campaigns.service.js $W/wa-campaigns.controller.js $W/wa-campaigns.module.js $W/wa-campaigns.utils.js $W/dto/wa-campaigns.dto.js $W/wa-birthdays.service.js $W/wa-birthdays.settings.js; do
  if [ -f "dist/$f" ]; then echo "$(norm "dist/$f") $f"; else echo "ABSENT $f"; fi
done
echo "HTML $(sha256sum public/system.html | cut -d' ' -f1)"
echo "SCHEMA $(sha256sum prisma/schema.prisma | cut -d' ' -f1)"
echo "CLIENT $(sha256sum node_modules/.prisma/client/index.js | cut -d' ' -f1)"
for l in tmp/install-20261124-r*.log; do [ -f "$l" ] && echo "LOG $l: $(grep -E 'UPDATE VERIFIED|FAILED|ROLLBACK' "$l" | tail -1)"; done
echo "ENV-FILE $(ls -l .env 2>/dev/null | awk '{print $1, $3}') WA_CONTROL-lines=$(grep -c '^WA_CONTROL_' .env 2>/dev/null)"
p=$(pgrep -f "final.noamanycenter.com/dist/main.js" | head -1); echo "APP-CWD $(readlink /proc/$p/cwd 2>/dev/null) pid=$p"
df -h . | tail -1
)
