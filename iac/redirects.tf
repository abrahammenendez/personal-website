resource "cloudflare_ruleset" "www_redirect" {
  zone_id = var.zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_request_dynamic_redirect"

  # Rewriting the whole request URI carries the path and the query string over,
  # so www.abrahammenendez.com/foo?a=1 lands on abrahammenendez.com/foo?a=1.
  # preserve_query_string governs static targets only and does nothing here.
  rules = [{
    ref         = "www_to_apex"
    description = "Redirect www to the apex"
    enabled     = true
    expression  = "(http.request.full_uri wildcard r\"https://www.*\")"
    action      = "redirect"
    action_parameters = {
      from_value = {
        status_code           = 301
        preserve_query_string = false
        target_url = {
          expression = "wildcard_replace(http.request.full_uri, r\"https://www.*\", r\"https://$${1}\")"
        }
      }
    }
  }]
}
