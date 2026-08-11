variable "zone_id" {
  description = "Cloudflare zone id for the site's domain."
  type        = string
}

variable "account_id" {
  description = "Cloudflare account id. Owns account-level resources such as R2 buckets."
  type        = string
}
