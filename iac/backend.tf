terraform {
  # The endpoint arrives as AWS_ENDPOINT_URL_S3, so the account id stays in the
  # CLOUDFLARE_ACCOUNT_ID repository variable instead of being copied here.
  backend "s3" {
    bucket = "personal-website-tfstate"
    key    = "cloudflare/terraform.tfstate"
    region = "auto"

    # R2 implements a subset of S3: no STS, no EC2 metadata service, no AWS
    # regions, and it rejects the trailing checksum the AWS SDK sends by default.
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true

    # Locking uses S3 conditional writes, which R2 supports on PutObject.
    use_lockfile = true
  }
}
