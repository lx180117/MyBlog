#!/usr/bin/env bash
# =============================================================================
#  本地 PostgreSQL 启停脚本（Windows + Git Bash）
#
#  为什么有这个脚本：本机没有 Docker，也没有安装版 PostgreSQL，验证时用的是
#  PostgreSQL 18 官方 Windows 二进制包（免安装），解压在用户目录下。
#  免安装意味着没有 Windows 服务、不会开机自启 —— 重启电脑后数据库是停的，
#  需要手动拉起。这个脚本把那条长命令收敛成一条。
#
#  用法：
#    bash db/local-pg.sh start      # 启动
#    bash db/local-pg.sh stop       # 停止
#    bash db/local-pg.sh status     # 查看状态
#    bash db/local-pg.sh restart    # 重启
#    bash db/local-pg.sh psql       # 用 blog 账号连进 psql
#    bash db/local-pg.sh counts     # 打印各表行数（快速确认数据状态）
#    bash db/local-pg.sh schema     # 重新执行 db/schema.sql（幂等，可重复跑）
#    bash db/local-pg.sh seed       # 重新执行后端 seed（补管理员与配置项）
#
#  可通过环境变量覆盖（便于换机器）：
#    PG_HOME  二进制解压目录，默认 ~/.workbuddy/binaries/pgsql/pgsql
#    PGDATA   数据目录，      默认 ~/.workbuddy/binaries/pgsql/data
#    PGPORT   端口，          默认 5432
# =============================================================================
set -euo pipefail

# Windows 原生程序不认 Git Bash 的 /c/... 路径，统一转成 C:/... 形式。
# （$HOME 在 Git Bash 下是 /c/Users/xxx，直接传给 pg_ctl -D 会报「目录不存在」）
to_win() {
  case "$1" in
    /*) cygpath -m "$1" 2>/dev/null || printf '%s' "$1" ;;
    *) printf '%s' "${1//\\//}" ;;
  esac
}

PG_HOME="$(to_win "${PG_HOME:-${USERPROFILE:-$HOME}/.workbuddy/binaries/pgsql/pgsql}")"
PGDATA="$(to_win "${PGDATA:-${USERPROFILE:-$HOME}/.workbuddy/binaries/pgsql/data}")"
PGPORT="${PGPORT:-5432}"
PGLOG="$(to_win "${PGLOG:-${USERPROFILE:-$HOME}/.workbuddy/binaries/pgsql/pg.log}")"

PGBIN="$PG_HOME/bin"
DB_NAME="${DB_NAME:-blog}"
DB_USER="${DB_USER:-blog}"
DB_PASSWORD="${DB_PASSWORD:-blog_password}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"

# psql/pg_ctl 是 Windows 原生程序：路径要用 Windows 形式（正斜杠可以），
# 并且要给 Git Bash 的路径转换关掉开关，否则 /D 这类参数会被改写成盘符路径
export MSYS_NO_PATHCONV=1

require_bin() {
  if [ ! -x "$PGBIN/pg_ctl.exe" ]; then
    echo "找不到 $PGBIN/pg_ctl.exe" >&2
    echo "请确认 PG_HOME 指向 PostgreSQL 二进制解压目录" >&2
    exit 1
  fi
}

case "${1:-}" in
  start)
    require_bin
    "$PGBIN/pg_ctl.exe" -D "$PGDATA" -l "$PGLOG" -o "-p $PGPORT" -w start
    echo "PostgreSQL 已启动，监听 127.0.0.1:$PGPORT"
    ;;

  stop)
    require_bin
    "$PGBIN/pg_ctl.exe" -D "$PGDATA" -m fast stop
    ;;

  restart)
    require_bin
    "$PGBIN/pg_ctl.exe" -D "$PGDATA" -m fast restart -l "$PGLOG" -o "-p $PGPORT" -w
    ;;

  status)
    require_bin
    "$PGBIN/pg_ctl.exe" -D "$PGDATA" status || true
    curl -s -o /dev/null -w "后端 /health: HTTP %{http_code}\n" --max-time 3 http://127.0.0.1:3000/health || true
    ;;

  psql)
    PGPASSWORD="$DB_PASSWORD" PGHOST=127.0.0.1 PGPORT="$PGPORT" PGCLIENTENCODING=UTF8 \
      "$PGBIN/psql.exe" -U "$DB_USER" -d "$DB_NAME"
    ;;

  counts)
    # 注意：这条 SQL 里不要出现中文 —— Windows 控制台会把中文字面量按 GBK 编码，
    # 而客户端编码声明为 UTF8，服务端会直接报 invalid byte sequence for encoding "UTF8"
    PGPASSWORD="$DB_PASSWORD" PGHOST=127.0.0.1 PGPORT="$PGPORT" PGCLIENTENCODING=UTF8 \
      "$PGBIN/psql.exe" -U "$DB_USER" -d "$DB_NAME" -tAc "
      select 'users='||(select count(*) from users)
        ||' articles='||(select count(*) from articles)
        ||' comments='||(select count(*) from comments)
        ||' likes='||(select count(*) from article_likes)
        ||' views='||(select count(*) from page_views)
        ||' tags='||(select count(*) from tags)
        ||' categories='||(select count(*) from categories)
        ||' settings='||(select count(*) from site_settings);"
    ;;

  schema)
    SCRIPT="$(cd "$(dirname "$0")" && pwd)/schema.sql"
    PGPASSWORD="$DB_PASSWORD" PGHOST=127.0.0.1 PGPORT="$PGPORT" PGCLIENTENCODING=UTF8 \
      "$PGBIN/psql.exe" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -q -f "$SCRIPT"
    echo "已执行 $SCRIPT（脚本本身幂等）"
    ;;

  seed)
    (cd "$(dirname "$0")/../server" && npm run db:seed)
    ;;

  *)
    sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
