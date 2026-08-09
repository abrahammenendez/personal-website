# 192.0.2.0 is RFC 5737 documentation space and answers nothing. Only the
# proxying matters: cloudflare_ruleset.www_redirect intercepts at the edge.
resource "cloudflare_dns_record" "www_placeholder" {
  zone_id = var.zone_id
  name    = "www.abrahammenendez.com"
  type    = "A"
  content = "192.0.2.0"
  ttl     = 1
  proxied = true
}

# Namecheap's email forwarding, and the SPF record that authorises it. Losing
# any of them breaks mail with no visible symptom, so removing one has to be
# deliberate enough to edit its lifecycle block first.
resource "cloudflare_dns_record" "mx_1" {
  zone_id  = var.zone_id
  name     = "abrahammenendez.com"
  type     = "MX"
  content  = "eforward1.registrar-servers.com"
  priority = 10
  ttl      = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "mx_2" {
  zone_id  = var.zone_id
  name     = "abrahammenendez.com"
  type     = "MX"
  content  = "eforward2.registrar-servers.com"
  priority = 10
  ttl      = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "mx_3" {
  zone_id  = var.zone_id
  name     = "abrahammenendez.com"
  type     = "MX"
  content  = "eforward3.registrar-servers.com"
  priority = 10
  ttl      = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "mx_4" {
  zone_id  = var.zone_id
  name     = "abrahammenendez.com"
  type     = "MX"
  content  = "eforward4.registrar-servers.com"
  priority = 15
  ttl      = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "mx_5" {
  zone_id  = var.zone_id
  name     = "abrahammenendez.com"
  type     = "MX"
  content  = "eforward5.registrar-servers.com"
  priority = 20
  ttl      = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "spf" {
  zone_id = var.zone_id
  name    = "abrahammenendez.com"
  type    = "TXT"
  content = "\"v=spf1 include:spf.efwd.registrar-servers.com ~all\""
  ttl     = 1

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_dns_record" "google_site_verification" {
  zone_id = var.zone_id
  name    = "abrahammenendez.com"
  type    = "TXT"
  content = "\"google-site-verification=tBmlOxvu5JfETpiDjK4V_fVhpr5zJvKrdGuw54OQIlE\""
  ttl     = 3600
}
