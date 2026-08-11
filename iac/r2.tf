# peelr's ONNX model, served to the browser by the Worker through its PEELR_MODELS
# binding in wrangler.jsonc. It cannot ship as a static asset: Cloudflare caps an
# individual asset at 25 MiB and the model is 87.70 MB.
#
# The binding is declared with the Worker rather than here, so this file owns the
# bucket's existence and nothing else. A deploy that adds the binding before this
# bucket exists fails, which is a one-time ordering problem on the first apply.
resource "cloudflare_r2_bucket" "models" {
  account_id    = var.account_id
  name          = "personal-website-models"
  location      = "weur"
  storage_class = "Standard"

  # Destroying this takes the model with it, and putting it back means re-running the
  # export from PyTorch rather than re-applying a config.
  lifecycle {
    prevent_destroy = true
  }
}
