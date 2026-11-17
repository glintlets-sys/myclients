#!/usr/bin/env bash
# Build the storefront (src/) and deploy it to wilber.cloudshops.app, then refresh the pre-rendered SEO pages.
#   tools/deploy-store.sh <aws-profile> [tenant] [stage]        e.g. tools/deploy-store.sh all-access-admin wilber-stage prod
#
#  1. ng build wilber-angular-app (production)
#  2. sync dist → s3://wibler-angular (hashed assets: 1 year, immutable; old hashed files are KEPT on purpose: SEO pages
#     written by an earlier publish still reference them until the republish in step 5 rewrites the pages)
#  3. index.html → s3://wibler-angular/index.html (no-cache)
#  4. the same index.html → CDN bucket  seo/<tenant>/_shell.html  — the "shell" the backend publisher wraps every
#     pre-rendered page in (hashed bundle names change every build, so it must be re-uploaded on every deploy)
#  5. POST /v1/platform/tenants/<tenant>/publish (X-Platform-Key read from SSM) — rewrites seo/<tenant>/… with the new shell
#  6. invalidate the storefront distribution (index.html, / and the SEO paths)
#
# Bucket / distribution / API come from the GlintCommerce-<stage> stack outputs; the storefront bucket and distribution
# are not in CDK (see README "Deploy"). Override with STORE_BUCKET / STORE_DISTRIBUTION / API_URL if needed.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: keep "/*" and "/index.html" as-is
PROFILE="${1:?usage: deploy-store.sh <aws-profile> [tenant] [stage]}"
TENANT="${2:-wilber-stage}"
STAGE="${3:-prod}"
REGION=ap-south-1           # the profile may default elsewhere (all-access-admin → ap-south-2)
STORE_BUCKET="${STORE_BUCKET:-wibler-angular}"
STORE_DISTRIBUTION="${STORE_DISTRIBUTION:-EBUFHWO6SEHTO}"
AWS=(aws --profile "$PROFILE" --region "$REGION")
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STACK="GlintCommerce-${STAGE}"

output() {
  "${AWS[@]}" cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
CDN_BUCKET="${CDN_BUCKET:-$(output CdnBucketName)}"
API_URL="${API_URL:-$(output ApiUrl)}"
[[ -n "$CDN_BUCKET" && "$CDN_BUCKET" != "None" ]] || { echo "No CdnBucketName output on $STACK" >&2; exit 1; }

grep -q "tenant: '${TENANT}'" "$ROOT/src/environments/environment.prod.ts" \
  || { echo "src/environments/environment.prod.ts is not built for tenant '${TENANT}'" >&2; exit 1; }

cd "$ROOT"
npm ci --no-audit --no-fund
npx ng build wilber-angular-app --configuration production
OUT="dist/wilber-angular-app/browser"
[[ -f "$OUT/index.html" ]] || { echo "build produced no $OUT/index.html" >&2; exit 1; }

# 2 + 3. Storefront files (no --delete: see header).
# Hashed build files (main-XXXX.js, chunk-*.js, styles-*.css, media/) never change: cache for a year.
# assets/ keeps fixed file names (photos get replaced), so browsers re-check them after an hour.
"${AWS[@]}" s3 sync "$OUT" "s3://$STORE_BUCKET" --exclude "index.html" --exclude "assets/*" --cache-control "public, max-age=31536000, immutable"
"${AWS[@]}" s3 sync "$OUT/assets" "s3://$STORE_BUCKET/assets" --cache-control "public, max-age=3600"
"${AWS[@]}" s3 cp "$OUT/index.html" "s3://$STORE_BUCKET/index.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"

# 4. Shell for the publisher (read by the publish Lambda; it is the public index.html, so it being reachable on the CDN
#    domain is harmless — the storefront's CloudFront Function never maps a URL to it).
"${AWS[@]}" s3 cp "$OUT/index.html" "s3://$CDN_BUCKET/seo/$TENANT/_shell.html" --cache-control "no-cache" --content-type "text/html; charset=utf-8"

# 5. Republish so every pre-rendered page uses the new shell.
KEY="$("${AWS[@]}" ssm get-parameter --with-decryption --name "/glint-commerce/${STAGE}/platform/platformKey" --query Parameter.Value --output text)"
RESULT="$(curl -fsS -X POST "$API_URL/v1/platform/tenants/$TENANT/publish" -H "X-Platform-Key: $KEY" -H "Content-Type: application/json")"
unset KEY
echo "Published: $(echo "$RESULT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s);console.log("version",p.version,"| seo",JSON.stringify(p.seo||{}))})')"

# 6. CDN caches (pre-rendered pages are cached 300 s anyway; this makes the new build visible at once).
"${AWS[@]}" cloudfront create-invalidation --distribution-id "$STORE_DISTRIBUTION" \
  --paths "/*" >/dev/null   # "/" alone did not clear the home page (Shoba, 4 Nov)

echo "Storefront deployed: https://wilber.cloudshops.app (tenant $TENANT)"
