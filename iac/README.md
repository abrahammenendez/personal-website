# iac

The Cloudflare zone for my personal website: its DNS records, the `www` to apex
redirect, and the R2 bucket holding peelr's model. Anything Workers-shaped stays
in [`wrangler.jsonc`](../wrangler.jsonc) and is applied by the deploy job, so
nothing here touches the Worker, its routes, or its custom domain. The bucket is
the one exception by necessity: bindings live with the Worker, but the bucket
they point at has to exist first.

Cloudflare creates a read-only proxied record for every Worker custom domain.
Those records are deliberately absent from this configuration: OpenTofu only
manages what it declares, and declaring them would fight Wrangler.

## Working on it

`apply` runs only in CI, which is the only place the Cloudflare credentials
exist. Locally you get the checks that need no credentials:

```sh
tofu fmt -recursive
tofu init -backend=false
tofu validate
```

The same three run on every pull request, and again before `apply` on `main`.

## Configuration

| Name | Kind | Where |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | `prod` environment |
| `IAC_TFSTATE_R2_ACCESS_KEY_ID` | secret | `prod` environment |
| `IAC_TFSTATE_R2_SECRET_ACCESS_KEY` | secret | `prod` environment |
| `CLOUDFLARE_ACCOUNT_ID` | variable | repository |
| `CLOUDFLARE_ZONE_ID` | variable | repository |

`CLOUDFLARE_API_TOKEN` is shared with the Worker deploy, so on top of what
Wrangler needs it carries DNS and single redirect edit rights on this zone.
The R2 keys are S3-compatible credentials for the state bucket, not a
Cloudflare API token.

## Adopting a resource made in the dashboard

1. Run the **Generate IaC** workflow. It runs `cf-terraforming` against the live
   zone and uploads the generated resources and `import` blocks as an artifact.
2. Keep only what belongs here. `generate` and `import` disagree about which
   resources exist and number them independently, so every `import` block needs a
   matching resource block, and Cloudflare's managed rulesets belong to neither.
3. Strip read-only attributes from the generated rules. `tofu validate` accepts
   several of them and `plan` then refuses, so a clean validate proves little.
4. Push. The deploy workflow performs the import. Delete the `import` blocks in a
   follow-up commit once it is green.
5. Confirm the next run plans no changes. A configuration that still wants to
   change something does not match the zone, and the configuration is what
   should move.

Very important to take record contents, TTLs and TXT quoting from the generator rather than
guessing them. They round-trip through the API in shapes that are easy to get
subtly wrong, and a wrong guess surfaces as drift that never settles.
