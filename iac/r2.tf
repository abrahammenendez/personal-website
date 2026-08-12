# Large binaries that experiments download at runtime, and that Workers cannot serve as
# static assets because of the 25 MiB per-file cap. Today that is peelr's ONNX model,
# bound as PEELR_MODELS in wrangler.jsonc.
#
# Bindings are declared with the Worker rather than here, so this file owns the bucket's
# existence and nothing else. A deploy that adds a binding before the bucket exists
# fails, which is a one-time ordering problem on the first apply.
resource "cloudflare_r2_bucket" "models" {
  account_id    = var.account_id
  name          = "personal-website-models"
  location      = "weur"
  storage_class = "Standard"

  # The objects here are built outside this repository and uploaded by hand, so a
  # destroy loses data that no amount of re-applying brings back.
  lifecycle {
    prevent_destroy = true
  }
}
