#!/bin/sh
# ==========================================================================================================================
# gitea-board-badges — end-to-end test
# ==========================================================================================================================
#
# WHAT IT TESTS
#   That footer.tmpl really works in a real Gitea, seen through a real browser:
#     - every issue that is on a project board gets a badge with the right column name;
#     - an issue that is on no board gets no badge;
#     - the "Status" dropdown filters the whole list correctly, across pages (details in test/browser.mjs).
#
# HOW
#   1. Start a throwaway Gitea in a Docker container (the official image, gitea/gitea:latest unless GITEA_IMAGE says
#      otherwise), with footer.tmpl installed the same way as in production.
#   2. Fill it with test data through Gitea's API: one user, one private repository with four issues, one board with the
#      columns To Do / In Progress / Done, and three of the four issues placed on that board.
#   3. Open the issue lists in Chromium (Microsoft's official Playwright image) and check the result (test/browser.mjs).
#   4. Remove everything again, also when the test fails halfway.
#   Nothing touches any other Gitea: the test Gitea runs on its own private Docker network.
#
# REQUIREMENTS
#   Docker (allowed to pull gitea/gitea and mcr.microsoft.com/playwright) and permission to run it; on Linux usually as
#   root or as a member of the "docker" group.
#
# USAGE
#   test/test.sh                                   test with gitea/gitea:latest
#   GITEA_IMAGE=gitea/gitea:<version> test/test.sh  test with another Gitea version, e.g. before upgrading the server
#   Exit code 0 = all checks passed, anything else = a check failed (the output says which one).
#   Screenshots of the checked pages are written to test/out/.
# ==========================================================================================================================

# Stop at the first command that fails, so a broken step never leads to a misleading "all ok".
set -e

# If Docker is installed as a snap (Ubuntu), its binary lives in /snap/bin; adding it does no harm elsewhere.
export PATH=$PATH:/snap/bin

# DIR   = the root of this repository (the folder above test/), wherever the script is started from.
# IMAGE = the Gitea image to test with; can be overridden with the GITEA_IMAGE environment variable.
# PW    = the official Playwright image (Node.js + Chromium) that runs the browser part.
DIR=$(cd "$(dirname "$0")/.." && pwd)
IMAGE=${GITEA_IMAGE:-gitea/gitea:latest}
PW=mcr.microsoft.com/playwright:v1.56.0-noble

# Scratch folder for the test Gitea's data, inside this repository (test/.work, ignored by git). Not /tmp: the snap
# version of Docker has its own private /tmp and could not see files we put there.
WORK=$DIR/test/.work

# Names for the test container and its network. "$$" is the process id of this script, which makes the names unique, so
# two test runs at the same time do not get in each other's way.
NAME=gbb_gitea_$$ NET=gbb_net_$$

# Clean-up: remove the container, the network and the scratch folder. "trap ... EXIT" runs it whenever the script ends:
# after success, after a failed check, or after Ctrl+C. "|| true" ignores things that were already gone.
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

# --------------------------------------------------------------------------------------------------------------------------
# 1. Start a throwaway Gitea with footer.tmpl installed.
# --------------------------------------------------------------------------------------------------------------------------
# Gitea looks for custom templates in /data/gitea/templates/ inside its container. We create that folder in the scratch
# folder, copy footer.tmpl into it and mount the scratch folder as /data, the same place it has on the server.
rm -rf "$WORK" && mkdir -p "$WORK/data/gitea/templates/custom" "$DIR/test/out"
cp "$DIR/footer.tmpl" "$WORK/data/gitea/templates/custom/footer.tmpl"
cp "$DIR/test/browser.mjs" "$WORK/"
# Gitea runs as user id 1000 inside the container; it must own its data folder.
chown -R 1000:1000 "$WORK/data"

# A private network for the test: only the test Gitea and the test browser are on it.
docker network create "$NET" >/dev/null

# Start Gitea. The GITEA__section__KEY variables are Gitea settings:
#   INSTALL_LOCK=true  skip the installation wizard
#   DB_TYPE=sqlite3    a simple database in a file, enough for a test
#   DISABLE_SSH=true   no Git-over-SSH needed
#   ROOT_URL           the address at which the browser container will reach this Gitea
#   ISSUE_PAGING_NUM=2 only 2 issues per page (normally 20), so our 4 test issues are spread over 2 pages and the test
#                      can check that the status filter really covers the whole list and not just the open page
docker run -d --name "$NAME" --network "$NET" -e USER_UID=1000 -e USER_GID=1000 \
  -e GITEA__security__INSTALL_LOCK=true -e GITEA__database__DB_TYPE=sqlite3 -e GITEA__server__DISABLE_SSH=true \
  -e GITEA__ui__ISSUE_PAGING_NUM=2 \
  -e GITEA__server__ROOT_URL="http://$NAME:3000/" -v "$WORK/data:/data" "$IMAGE" >/dev/null

# Wait until Gitea is up: ask its health check every 2 seconds, for at most 2 minutes.
for i in $(seq 60); do docker exec "$NAME" curl -fsS http://127.0.0.1:3000/api/healthz >/dev/null 2>&1 && break; sleep 2; done

# Print the Gitea version, so the output shows which version was tested.
echo "gitea $(docker exec -u git "$NAME" gitea --version | cut -d' ' -f3)"

# --------------------------------------------------------------------------------------------------------------------------
# 2. Test data.
# --------------------------------------------------------------------------------------------------------------------------
# A test user "tester" (administrator, so it may do everything) with a known password for the browser login, and an API
# token for the commands below. Gitea's command line tool must run as the "git" user inside the container.
# Note: this user, its password and its token are throwaway test data. They exist only inside the temporary test
# container, which is deleted when the test ends; they give access to nothing else.
docker exec -u git "$NAME" gitea admin user create --username tester --password 'Test-12345!' --email t@example.invalid \
  --admin --must-change-password=false >/dev/null
T=$(docker exec -u git "$NAME" gitea admin user generate-access-token --username tester --token-name t --scopes all --raw)

# The commands between <<'EOF' and EOF run inside the Gitea container (which has curl) and talk to Gitea's REST API.
docker exec -i -e T="$T" "$NAME" sh -s <<'EOF'
set -e
A=http://127.0.0.1:3000/api/v1/repos/tester/demo
# j = one API call with the token; -f makes curl fail on an HTTP error, so "set -e" stops the test.
j() { curl -fsS -o /dev/null -H "Authorization: token $T" -H 'Content-Type: application/json' "$@"; }

# A private repository "demo", like our real repositories.
j -X POST http://127.0.0.1:3000/api/v1/user/repos -d '{"name":"demo","private":true}'

# Four issues; they get the numbers 1 to 4 in this order. "Not on a board" is never put on the board.
for t in "First issue" "Second issue" "Third issue" "Not on a board"; do j -X POST $A/issues -d "{\"title\":\"$t\"}"; done

# A board made from Gitea's "basic kanban" template. That template creates four columns with these ids:
#   1 Backlog, 2 To Do, 3 In Progress, 4 Done
j -X POST $A/projects -d '{"title":"demo","template_type":"basic_kanban"}'

# Give the columns colours, like a real board ("column-id colour").
for c in '2 #0052cc' '3 #009800' '4 #fbca04'; do set -- $c; j -X PATCH $A/projects/1/columns/$1 -d "{\"color\":\"$2\"}"; done

# Remove the empty "Backlog" column, like on a real board: first make "To Do" the default column (new issues added to
# the board land there), because Gitea does not delete the default column.
j -X POST $A/projects/1/columns/2/default
j -X DELETE $A/projects/1/columns/1

# Put issue 1 in To Do, issue 2 in In Progress and issue 3 in Done ("issue-id column-id").
for p in '1 2' '2 3' '3 4'; do set -- $p; j -X POST $A/projects/1/columns/$2/issues/$1; done
EOF

# --------------------------------------------------------------------------------------------------------------------------
# 3. Check the result in a real browser.
# --------------------------------------------------------------------------------------------------------------------------
# Start the Playwright container on the same private network, so it can reach the test Gitea by its name. It installs the
# Playwright library (same version as the image), copies browser.mjs and runs it. BASE tells browser.mjs where Gitea is;
# test/out is mounted as /out for the screenshots. The exit code of browser.mjs becomes the exit code of this script.
docker run --rm --network "$NET" -e BASE="http://$NAME:3000" -v "$WORK:/work" -v "$DIR/test/out:/out" "$PW" \
  sh -c 'cd /tmp && npm i -s playwright@1.56.0 >/dev/null 2>&1 && cp /work/browser.mjs . && node browser.mjs'

# 4. Clean-up happens automatically here, through the "trap cleanup EXIT" above.
