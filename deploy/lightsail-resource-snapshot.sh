#!/usr/bin/env bash
set -euo pipefail

echo "== snapshot =="
date -Is
hostname
uptime

echo
echo "== memory =="
free -h

echo
echo "== disk =="
df -h /

echo
echo "== top memory processes =="
ps -eo pid,ppid,user,%mem,%cpu,rss,comm --sort=-rss | head -20

echo
echo "== top cpu processes =="
ps -eo pid,ppid,user,%mem,%cpu,rss,comm --sort=-%cpu | head -20

echo
echo "== service state =="
systemctl --no-pager --plain status chatapp-realtime caddy nginx php8.3-fpm mysql 2>/dev/null || true

echo
echo "== current boot oom/kernel warnings =="
journalctl -k -b --no-pager | grep -Ei 'oom|out of memory|killed process|blocked for more|hung task|i/o error|ext4|nvme|memory' || true

echo
echo "== previous boot oom/kernel warnings =="
journalctl -k -b -1 --no-pager | grep -Ei 'oom|out of memory|killed process|blocked for more|hung task|i/o error|ext4|nvme|memory' || true

echo
echo "== realtime journal tail =="
journalctl -u chatapp-realtime -n 120 --no-pager || true

echo
echo "== web access volume =="
for log in /var/log/nginx/access.log /var/log/caddy/access.log /var/log/apache2/chatapp-core-access.log; do
  if [ -r "$log" ]; then
    echo "-- $log"
    tail -1000 "$log" | awk '{print $1}' | sort | uniq -c | sort -nr | head -20
  fi
done
