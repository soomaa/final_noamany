#!/usr/bin/env bash
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
[ -f .env ] || { echo "DATABASE_URL source .env is missing" >&2; exit 1; }

database_url="$(sed -n -E 's/^DATABASE_URL="?([^" ]+)"?$/\1/p' .env | head -1)"
[ -n "$database_url" ] || { echo "DATABASE_URL is missing" >&2; exit 1; }

IFS=$'\x1f' read -r db_user db_password db_host db_port db_name < <(
  DATABASE_URL_INPUT="$database_url" node -e '
    const u = new URL(process.env.DATABASE_URL_INPUT);
    if (u.protocol !== "mysql:") throw new Error("DATABASE_URL must use mysql://");
    const decode = (value) => decodeURIComponent(value);
    const values = [decode(u.username), decode(u.password), u.hostname, u.port || "3306", decode(u.pathname.slice(1))];
    if (values.some((v) => /[\x1f\r\n]/.test(v))) throw new Error("unsupported control character in DATABASE_URL");
    process.stdout.write(`${values.join("\x1f")}\n`);
  '
)
[[ "$db_name" =~ ^[A-Za-z0-9_]+$ ]] || { echo "unsafe database name" >&2; exit 1; }

backup_dir="${BACKUP_DIR:-./backups}"
backup_keep="${BACKUP_KEEP:-14}"
[[ "$backup_keep" =~ ^[1-9][0-9]*$ ]] || { echo "BACKUP_KEEP must be a positive integer" >&2; exit 1; }
mkdir -p "$backup_dir"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_dir/${db_name}_${timestamp}.sql.gz"
checksum_file="$backup_file.sha256"
MYSQL_PWD="$db_password" mysqldump \
  -h "$db_host" -P "$db_port" -u "$db_user" \
  --single-transaction --quick --routines --triggers --events --hex-blob \
  --no-tablespaces --set-gtid-purged=OFF "$db_name" | gzip > "$backup_file"
gzip -t "$backup_file"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$backup_file" > "$checksum_file"
else
  shasum -a 256 "$backup_file" > "$checksum_file"
fi
chmod 600 "$backup_file" "$checksum_file"

find "$backup_dir" -maxdepth 1 -type f -name "${db_name}_*.sql.gz" -print \
  | sort -r \
  | awk -v keep="$backup_keep" 'NR > keep' \
  | while IFS= read -r candidate; do
  case "$candidate" in
    "$backup_dir"/*)
      unlink -- "$candidate"
      [ ! -e "$candidate.sha256" ] || unlink -- "$candidate.sha256"
      ;;
    *) echo "refusing unsafe rotation target: $candidate" >&2; exit 1 ;;
  esac
done

echo "backup=$backup_file checksum=$checksum_file status=verified"
