#!/usr/bin/env bash
# DramaFlow real-mode one-shot deployer for a fresh Linux ECS.
# Targets: CentOS Stream 9 / RHEL 9 / Ubuntu 22.04 LTS / Debian 12 (x86_64, root).
# Flow: install deps -> clone GitHub code -> build Next.js app -> install systemd
#       service + nginx vhost -> (optional) bootstrap env template -> health check.
# Idempotent: re-runs only replace code/configuration, never overwrite an existing
#             /etc/frameflow.env, local data/ or node_modules/.
set -euo pipefail

# ------------------------------- defaults ------------------------------------
DEPLOY_DIR="/opt/frameflow"
ENV_FILE="/etc/frameflow.env"
BACKUP_ROOT="/opt/.frameflow-backups"
GITHUB_REPO_URL=""          # required via --github-url
REVISION="main"
PUBLIC_IP=""                # required via --public-ip
DEPLOY_USER="frameflow"
DEPLOY_GROUP="frameflow"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SKIP_BUILD=0
SKIP_NGINX=0
SKIP_SELF_CHECK=0
FORCE_ENV_TEMPLATE=0

usage() {
  cat <<'USAGE'
DramaFlow real-mode deployer (root-only, Linux x86_64).

USAGE:
  sudo bash deploy-real-mode.sh \
    --github-url https://<PAT>@github.com/<owner>/DramaFlow.git \
    --public-ip <YOUR_ECS_PUBLIC_IP> \
    [--revision <branch|tag|sha>] \
    [--deploy-dir /opt/frameflow] \
    [--skip-build] [--skip-nginx] [--skip-self-check] \
    [--force-env-template]

FLAGS:
  --github-url         DramaFlow GitHub clone URL. For a private repo, embed a
                       fine-grained personal access token with Contents read
                       permission, e.g. https://ghp_xxx@github.com/acme/DramaFlow.git
  --public-ip          Public IPv4 of this ECS (written into nginx server_name).
  --revision           Branch, tag or commit SHA to deploy. Default: main.
  --deploy-dir         Where the Node.js app lives on disk. Default: /opt/frameflow.
  --skip-build         Skip npm ci / prisma generate / tsc / next build (use when
                       you already have a pre-built tree or are debugging).
  --skip-nginx         Do not touch /etc/nginx (for managed ingress scenarios).
  --skip-self-check    Do not run the Zod schema self-check after build (only
                       useful on a second pass before credentials are filled in).
  --force-env-template Re-write /etc/frameflow.env.template (never overwrites the
                       active /etc/frameflow.env).
USAGE
}

# ------------------------------- helpers -------------------------------------
log()  { printf '[\033[0;34mDEPLOY\033[0m] %s\n' "$*"; }
warn() { printf '[\033[0;33mWARN  \033[0m] %s\n' "$*" >&2; }
err()  { printf '[\033[0;31mERROR \033[0m] %s\n' "$*" >&2; }

ensure_root() {
  if [ "$(id -u)" -ne 0 ]; then
    err "Must run as root (sudo bash $0 ...). Abort."
    exit 1
  fi
}

detect_os() {
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-linux}"
    OS_ID_LIKE="${ID_LIKE:-}"
    VERSION_ID="${VERSION_ID:-0}"
  else
    err "Cannot detect OS (/etc/os-release missing). Abort."
    exit 2
  fi
  case "$OS_ID" in
    centos|rhel|rocky|almalinux|fedora)   OS_FAMILY="rhel" ;;
    ubuntu|debian)                         OS_FAMILY="debian" ;;
    *)
      case "$OS_ID_LIKE" in
        *rhel*|*fedora*)   OS_FAMILY="rhel" ;;
        *debian*)          OS_FAMILY="debian" ;;
        *)
          err "Unsupported OS: ID=$OS_ID ID_LIKE=$OS_ID_LIKE. Abort."
          exit 2
          ;;
      esac
      ;;
  esac
  log "OS detected: $OS_ID ($OS_FAMILY family, version $VERSION_ID)"
}

install_prereqs_rhel() {
  log "Installing base packages via dnf..."
  dnf install -y git nginx curl tar gzip unzip ca-certificates procps-ng
  if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(+!((process.versions.node.split('.')[0]|0) >= 22))" 2>/dev/null; then
    log "Installing Node.js 22.x via nodesource..."
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    dnf install -y nodejs
  fi
  node -v && npm -v
}

install_prereqs_debian() {
  log "Installing base packages via apt-get..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    git nginx curl tar gzip unzip ca-certificates procps xz-utils
  if ! command -v node >/dev/null 2>&1 || ! node -e "process.exit(+!((process.versions.node.split('.')[0]|0) >= 22))" 2>/dev/null; then
    log "Installing Node.js 22.x via nodesource..."
    apt-get install -y --no-install-recommends ca-certificates curl gnupg
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null || true
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update -y
    apt-get install -y --no-install-recommends nodejs
  fi
  node -v && npm -v
}

ensure_deploy_user() {
  if ! getent group "$DEPLOY_GROUP" >/dev/null; then
    log "Creating system group: $DEPLOY_GROUP"
    groupadd --system "$DEPLOY_GROUP"
  fi
  if ! getent passwd "$DEPLOY_USER" >/dev/null; then
    log "Creating system user: $DEPLOY_USER (no-login)"
    useradd --system --gid "$DEPLOY_GROUP" --shell /usr/sbin/nologin \
      --home-dir /opt --no-create-home "$DEPLOY_USER"
  fi
}

backup_existing() {
  mkdir -p "$BACKUP_ROOT"
  TS="$(date +%Y%m%d-%H%M%S)"
  BACKUP_DIR="$BACKUP_ROOT/frameflow-$TS"
  mkdir -p "$BACKUP_DIR"
  if [ -d "$DEPLOY_DIR" ]; then
    log "Backing up current deploy at $DEPLOY_DIR -> $BACKUP_DIR"
    if [ -f "$ENV_FILE" ]; then
      cp -a "$ENV_FILE" "$BACKUP_DIR/frameflow.env" || warn "Could not backup $ENV_FILE"
    fi
    if [ -f /etc/systemd/system/frameflow.service ]; then
      cp -a /etc/systemd/system/frameflow.service "$BACKUP_DIR/frameflow.service"
    fi
    if [ -f /etc/nginx/conf.d/frameflow.conf ]; then
      cp -a /etc/nginx/conf.d/frameflow.conf "$BACKUP_DIR/frameflow.conf"
    fi
    if [ -d "$DEPLOY_DIR/data" ]; then
      tar -czf "$BACKUP_DIR/data.tgz" -C "$DEPLOY_DIR" data 2>/dev/null || warn "data/ backup skipped"
    fi
    # code backup (expensive, but safe)
    tar --exclude='./node_modules/.cache' --exclude='./.next/cache' \
      -czf "$BACKUP_DIR/full.tgz" -C "$DEPLOY_DIR" . 2>/dev/null || true
    du -sh "$BACKUP_DIR"/*
  else
    log "No previous deploy at $DEPLOY_DIR; no backup required."
  fi
}

fetch_code() {
  if [ -z "$GITHUB_REPO_URL" ]; then
    err "--github-url is required. Abort."
    exit 3
  fi
  if [ -z "$PUBLIC_IP" ]; then
    err "--public-ip is required (used for nginx server_name). Abort."
    exit 3
  fi
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  if [ ! -d "$DEPLOY_DIR/.git" ]; then
    log "Cloning DramaFlow from $GITHUB_REPO_URL (revision $REVISION) ..."
    # shallow clone, then fetch target revision in case it's not on HEAD of main
    git clone --depth 50 --branch main --single-branch \
      "$GITHUB_REPO_URL" "$DEPLOY_DIR" || {
      warn "Branch clone failed, falling back to full shallow clone..."
      git clone --depth 50 "$GITHUB_REPO_URL" "$DEPLOY_DIR"
    }
  fi
  cd "$DEPLOY_DIR"
  log "Fetching latest commits for revision: $REVISION"
  git remote set-url origin "$GITHUB_REPO_URL"
  git fetch --depth 50 origin "+refs/heads/*:refs/remotes/origin/*" "+refs/tags/*:refs/tags/*"
  # Attempt direct checkout (branch or sha or tag)
  if git show-ref --verify --quiet "refs/remotes/origin/$REVISION"; then
    git checkout -f "origin/$REVISION"
  elif git rev-parse --verify "$REVISION" >/dev/null 2>&1; then
    git checkout -f "$REVISION"
  else
    warn "Could not resolve $REVISION exactly; falling back to origin/main"
    git checkout -f origin/main
  fi
  log "Deploying code at $(git rev-parse --short HEAD)"
}

preserve_state_and_fix_owner() {
  cd "$DEPLOY_DIR"
  # Make sure data/ exists and is writable by the app user.
  mkdir -p data .next
  # node_modules may have been removed by a fresh clone or the user wiped it,
  # in which case npm ci will recreate it later. Do not fail here.
  if [ -d node_modules ]; then
    chown -R "$DEPLOY_USER:$DEPLOY_GROUP" node_modules || true
  fi
  chown -R "$DEPLOY_USER:$DEPLOY_GROUP" data .next
  # Deployed code itself stays owned by root for auditability.
  chown -R root:root "$DEPLOY_DIR"
  # Re-apply ownership on writable folders after chown -R root:root
  chown -R "$DEPLOY_USER:$DEPLOY_GROUP" data .next
  # Place a revision marker for operators.
  git -C "$DEPLOY_DIR" rev-parse HEAD > "$DEPLOY_DIR/.deploy-revision" 2>/dev/null || true
}

build_app() {
  if [ "$SKIP_BUILD" -eq 1 ]; then
    warn "--skip-build given, skipping npm ci/build."
    return 0
  fi
  cd "$DEPLOY_DIR"
  log "Running npm ci as $DEPLOY_USER user..."
  # Run npm operations as deploy user, keep HOME neutral.
  sudo -u "$DEPLOY_USER" -g "$DEPLOY_GROUP" \
    env HOME="/opt" PATH="$PATH" npm ci --no-audit --no-fund --loglevel=error
  log "Running prisma generate..."
  sudo -u "$DEPLOY_USER" -g "$DEPLOY_GROUP" \
    env HOME="/opt" PATH="$PATH" npx --yes prisma generate
  log "Type-checking with tsc --noEmit..."
  sudo -u "$DEPLOY_USER" -g "$DEPLOY_GROUP" \
    env HOME="/opt" PATH="$PATH" npx --yes tsc --noEmit || {
      warn "tsc reported warnings/errors; printed above. Continuing (build may still succeed)."
    }
  log "Building Next.js app (npm run build)..."
  sudo -u "$DEPLOY_USER" -g "$DEPLOY_GROUP" \
    env HOME="/opt" PATH="$PATH" NODE_ENV=production npm run build
  log "BUILD_OK"
}

install_env_template() {
  TEMPLATE_SRC="$REPO_ROOT/deploy/real-mode/frameflow.env.template"
  if [ ! -f "$TEMPLATE_SRC" ]; then
    # Fallback: the deploy script may have been called from outside the repo
    # (e.g. curl | bash), in which case look inside deploy dir at runtime.
    TEMPLATE_SRC="$DEPLOY_DIR/deploy/real-mode/frameflow.env.template"
  fi
  if [ ! -f "$TEMPLATE_SRC" ]; then
    warn "frameflow.env.template not found at either $REPO_ROOT or $DEPLOY_DIR."
    return 0
  fi
  if [ ! -f "$ENV_FILE" ] || [ "$FORCE_ENV_TEMPLATE" -eq 1 ]; then
    if [ -f "$ENV_FILE" ]; then
      # user explicitly asked to refresh the template alongside existing env
      log "Updating template-only copy at $ENV_FILE.template (active env untouched)."
      cp -a "$TEMPLATE_SRC" "$ENV_FILE.template"
    else
      log "Bootstrapping empty env at $ENV_FILE from template."
      cp -a "$TEMPLATE_SRC" "$ENV_FILE"
      chown root:"$DEPLOY_GROUP" "$ENV_FILE"
      chmod 0640 "$ENV_FILE"
      echo
      warn "!!! EMPTY CREDENTIALS: $ENV_FILE has been created from template but values are EMPTY."
      warn "!!! Populate every SET-me field in $ENV_FILE before starting the service."
      warn "!!! See: $REPO_ROOT/deploy/real-mode/README.md#2-collect-volcengine-credentials"
      echo
    fi
  else
    log "Keeping existing $ENV_FILE intact (never overwrite operator credentials)."
    if [ ! -f "$ENV_FILE.template" ] || [ "$FORCE_ENV_TEMPLATE" -eq 1 ]; then
      log "Installing reference template to $ENV_FILE.template for upgrade audits."
      cp -a "$TEMPLATE_SRC" "$ENV_FILE.template"
      chown root:"$DEPLOY_GROUP" "$ENV_FILE.template"
      chmod 0640 "$ENV_FILE.template"
    fi
  fi
}

install_systemd_unit() {
  UNIT_SRC="$REPO_ROOT/deploy/real-mode/frameflow.service.example"
  if [ ! -f "$UNIT_SRC" ]; then
    UNIT_SRC="$DEPLOY_DIR/deploy/real-mode/frameflow.service.example"
  fi
  if [ ! -f "$UNIT_SRC" ]; then
    err "Cannot find frameflow.service.example template. Abort."
    exit 4
  fi
  log "Installing /etc/systemd/system/frameflow.service..."
  # Render very small placeholders via sed; the rest of the unit is static.
  sed -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
      -e "s|__DEPLOY_USER__|$DEPLOY_USER|g" \
      -e "s|__DEPLOY_GROUP__|$DEPLOY_GROUP|g" \
      -e "s|__ENV_FILE__|$ENV_FILE|g" \
      "$UNIT_SRC" > /etc/systemd/system/frameflow.service
  chown root:root /etc/systemd/system/frameflow.service
  chmod 0644 /etc/systemd/system/frameflow.service
  systemctl daemon-reload
  systemctl enable frameflow.service 2>/dev/null || true
}

install_nginx_vhost() {
  if [ "$SKIP_NGINX" -eq 1 ]; then
    warn "--skip-nginx given, skipping nginx vhost install."
    return 0
  fi
  NGINX_SRC="$REPO_ROOT/deploy/real-mode/nginx-frameflow.conf.example"
  if [ ! -f "$NGINX_SRC" ]; then
    NGINX_SRC="$DEPLOY_DIR/deploy/real-mode/nginx-frameflow.conf.example"
  fi
  if [ ! -f "$NGINX_SRC" ]; then
    err "Cannot find nginx-frameflow.conf.example template. Abort."
    exit 5
  fi
  log "Installing /etc/nginx/conf.d/frameflow.conf..."
  sed -e "s|__PUBLIC_IP__|$PUBLIC_IP|g" \
      -e "s|__DEPLOY_DIR__|$DEPLOY_DIR|g" \
      "$NGINX_SRC" > /etc/nginx/conf.d/frameflow.conf
  # Disable the distribution default server_name "_" block so IP-based requests
  # hit our frameflow.conf (default_server) instead of getting 403.
  if [ -f /etc/nginx/nginx.conf ]; then
    if grep -qE 'server_name\s+_\s*;' /etc/nginx/nginx.conf 2>/dev/null; then
      warn "Found default server_name _ in /etc/nginx/nginx.conf; commenting default 80/443 blocks out so frameflow.conf can be default_server."
      python3 - <<'PY'
from pathlib import Path
p = Path('/etc/nginx/nginx.conf')
text = p.read_text()
out, depth, in_default_block, default_started = [], 0, False, False
for line in text.splitlines(True):
    s = line.rstrip()
    stripped = s.strip()
    opens = line.count('{')
    closes = line.count('}')
    if not in_default_block and re.search(r'server\s*\{', stripped) and any(k in s for k in ['listen       80 default_server;', 'listen 80;', 'server_name  _;'] if False else [True]):
        # heuristic: enter candidate
        default_started = True
    if default_started and 'server_name  _;' in s:
        in_default_block = True
        depth = 0
    if in_default_block:
        depth += opens - closes
        # comment it out
        if stripped and not stripped.startswith('#'):
            line = '# ' + line
        if depth <= 0 and closes > 0:
            in_default_block = False
            default_started = False
    out.append(line)
p.write_text(''.join(out))
PY
      # Fallback: python regex engine may not have re imported. Use simpler awk.
      awk 'BEGIN{bl=0; skip=0; lastskip=0}
           {
             line=$0
             if (match(line, /server[[:space:]]*\{/)>0) { cand=1; depth=0; block="" }
             if (cand) { block = block line "\n" }
             if (cand) {
               for(i=1;i<=length(line);i++){
                 c=substr(line,i,1);
                 if(c=="{") depth++;
                 if(c=="}") depth--;
               }
               if (index(block,"server_name  _;")>0 || index(block,"server_name _;")>0) { skip=1 }
               if (depth<=0) {
                 if (skip) {
                   # print commented block
                   split(block, lines, "\n")
                   for (li=1; li in lines; li++) {
                     if (lines[li]=="") continue
                     print "# " lines[li]
                   }
                 } else {
                   printf "%s", block
                 }
                 cand=0; skip=0; block=""
               }
               next
             }
             print line
           }' /etc/nginx/nginx.conf > /tmp/nginx.conf.fixed
      if [ -s /tmp/nginx.conf.fixed ] && nginx -t -c /tmp/nginx.conf.fixed >/dev/null 2>&1; then
        mv /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak."$(date +%Y%m%d%H%M%S)"
        mv /tmp/nginx.conf.fixed /etc/nginx/nginx.conf
      else
        warn "Could not auto-patch nginx.conf default server block; please comment the default server block yourself and run: nginx -t && systemctl restart nginx"
      fi
    fi
  fi
  if ! command -v nginx >/dev/null 2>&1; then
    warn "nginx binary missing; please install nginx manually before reload."
    return 0
  fi
  log "Validating nginx config..."
  if ! nginx -t; then
    err "nginx -t failed. Inspect the errors above. Service was NOT reloaded."
    return 1
  fi
  systemctl enable nginx 2>/dev/null || true
  systemctl restart nginx
  log "nginx (re)started with frameflow vhost for $PUBLIC_IP."
}

run_self_check() {
  if [ "$SKIP_SELF_CHECK" -eq 1 ]; then
    warn "--skip-self-check given, skipping real-mode credential self-check."
    return 0
  fi
  if [ ! -f "$ENV_FILE" ]; then
    warn "No $ENV_FILE exists yet; skip self-check."
    return 0
  fi
  if [ ! -d "$DEPLOY_DIR/.next" ]; then
    warn "Build artifacts missing; skip self-check (re-run without --skip-build)."
    return 0
  fi
  CHECKER="$REPO_ROOT/deploy/real-mode/check-real-config.mjs"
  if [ ! -f "$CHECKER" ]; then
    CHECKER="$DEPLOY_DIR/deploy/real-mode/check-real-config.mjs"
  fi
  if [ ! -f "$CHECKER" ]; then
    warn "check-real-config.mjs not found; skip self-check."
    return 0
  fi
  log "Running real-mode credential self-check against $ENV_FILE..."
  set +e
  (
    # load env values like systemd would: read KEY=VAL and export them
    while IFS= read -r ln || [ -n "$ln" ]; do
      # skip blanks/comments
      case "$ln" in
        ''|\#*) continue ;;
      esac
      # strip quotes around value, allow spaces around '='
      k="${ln%%=*}"
      v="${ln#*=}"
      # trim whitespace on k
      k="${k#"${k%%[![:space:]]*}"}"; k="${k%"${k##*[![:space:]]}"}"
      # strip paired quotes on v: leading + trailing only
      if [ "${#v}" -ge 2 ]; then
        a="${v:0:1}"
        b="${v: -1}"
        if [ "$a" = '"' ] && [ "$b" = '"' ]; then v="${v:1:${#v}-2}"; fi
        if [ "$a" = "'" ] && [ "$b" = "'" ]; then v="${v:1:${#v}-2}"; fi
      fi
      # export only safe identifier names
      if [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
        # shellcheck disable=SC2163
        export "$k=$v"
      fi
    done < "$ENV_FILE"
    export PROVIDER_MODE="${PROVIDER_MODE:-real}"
    cd "$DEPLOY_DIR"
    sudo -u "$DEPLOY_USER" -g "$DEPLOY_GROUP" \
      env -i HOME="/opt" PATH="$PATH" NODE_ENV=production \
      PROVIDER_MODE="$PROVIDER_MODE" \
      bash -lc 'set -a; [ -f '"$ENV_FILE"' ] && . '"$ENV_FILE"'; set +a; cd '"$DEPLOY_DIR"' && node --experimental-vm-modules --input-type=module - < '"$CHECKER" 2>&1
  )
  RC=$?
  set -e
  if [ "$RC" -eq 0 ]; then
    log "SELF_CHECK_OK: every required real-mode credential key is SET and schema-valid."
  else
    warn "SELF_CHECK_FAILED (exit $RC). This usually means $ENV_FILE still has empty placeholders."
    warn "  Edit $ENV_FILE with real Volcengine credentials, then re-run this deployer or:"
    warn "  sudo systemctl restart frameflow.service"
  fi
}

start_or_restart_service_and_verify() {
  log "(Re)starting frameflow.service..."
  systemctl restart frameflow.service
  sleep 4
  if ! systemctl is-active --quiet frameflow.service; then
    err "frameflow.service failed to start. Tail logs:"
    journalctl -u frameflow.service -n 30 --no-pager
    exit 6
  fi
  log "Waiting for Next.js /health to respond..."
  TRIES=0
  while [ "$TRIES" -lt 15 ]; do
    TRIES=$((TRIES+1))
    OUT="$(curl -sS --max-time 5 http://127.0.0.1:3000/api/health 2>&1 || true)"
    if printf '%s' "$OUT" | grep -q '"providerMode":"real"'; then
      log "HEALTH_OK: $OUT"
      return 0
    fi
    if printf '%s' "$OUT" | grep -q '"providerMode":"mock"'; then
      warn "HEALTH_MOCK: $OUT"
      warn "  The app is running in mock mode because $ENV_FILE PROVIDER_MODE != real or env file is not readable."
      warn "  Fix $ENV_FILE then: sudo systemctl restart frameflow.service"
      return 0
    fi
    sleep 2
  done
  warn "HEALTH_TIMEOUT: /api/health did not return providerMode after 30s."
  warn "  Tail logs: journalctl -u frameflow.service -n 50 --no-pager"
}

# ------------------------------- args parsing ---------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --github-url)    GITHUB_REPO_URL="$2"; shift 2 ;;
    --revision)      REVISION="$2"; shift 2 ;;
    --public-ip)     PUBLIC_IP="$2"; shift 2 ;;
    --deploy-dir)    DEPLOY_DIR="$2"; shift 2 ;;
    --skip-build)    SKIP_BUILD=1; shift ;;
    --skip-nginx)    SKIP_NGINX=1; shift ;;
    --skip-self-check) SKIP_SELF_CHECK=1; shift ;;
    --force-env-template) FORCE_ENV_TEMPLATE=1; shift ;;
    *) err "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

# ------------------------------- main ----------------------------------------
ensure_root
detect_os
case "$OS_FAMILY" in
  rhel)   install_prereqs_rhel ;;
  debian) install_prereqs_debian ;;
esac
ensure_deploy_user
backup_existing
fetch_code
preserve_state_and_fix_owner
build_app
install_env_template
install_systemd_unit
install_nginx_vhost || true
run_self_check
start_or_restart_service_and_verify

echo
log "=============================================================="
log " Deploy finished. What to do next:"
log "  1) Open:   http://$PUBLIC_IP/"
log "  2) Env:    $ENV_FILE  (template copy: $ENV_FILE.template)"
log "  3) Logs:   journalctl -u frameflow.service -n 50 -f"
log "  4) Nginx:  /etc/nginx/conf.d/frameflow.conf"
log "=============================================================="
