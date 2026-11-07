# Seller type — regulation does not change the share ratio

Source: the Notion page [파트너센터 가입 + 스토어 개설](https://app.notion.com/p/39039bb5c0d88067a398f95e64c27e51). The parent is 「작성 중」. The page was last edited on 2026-11-03. It has no verification badge. Whether a student council counts as a business, whether an unincorporated organization gets a signup flow, and minor signup are still open on the page. What follows is how that draft sits on the settlement ledger.

The three supplies settlement already separates stay separate: buyer VAT, VAT on the platform fee, and the tax invoice or withholding between recipients. Seller type chooses the **document** for a supply and **whether a payout may open**. It does not change a share ratio such as host 75, promoter 10, operator 5, platform 10.

Spree and Mercur have none of these axes. Both are one seller, a platform commission, and a transfer. Korean business type has no place to come from in those repos.

---

## Axes on the partner

The signup screen's 「개인 / 사업자」 splits into four fields. One field is not an alias for another.

| Field | What it asks | Where settlement uses it |
|-------|----------------|--------------------------|
| `seller_legal_category` | Is this party a mediated seller under the e-commerce act? `BUSINESS_SELLER`, `NON_BUSINESS_SELLER`, `UNINCORPORATED_ORG` | What to disclose to the buyer. Revenue-threshold notices. Not used in the share calculation |
| `seller_entity_type` | Who the contract party is. `INDIVIDUAL`, `CORPORATION`, `UNINCORPORATED_ORG` | Contract documents, and whose name must be on the account |
| `business_registration_type` | Which document confirmed the business registration. `SOLE_PROPRIETOR`, `CORPORATION`, `NOT_REGISTERED`, `UNKNOWN` | The administrative fact that a number exists. `NOT_REGISTERED` is not a legal finding of "non-business" |
| `vat_tax_type` | Which document is issued to this party | The kind of tax row. The partner's current value can change weekly from the National Tax Service |

Also `business_status` (active, suspended, closed), `ecommerce_seller_status` (whether a mail-order registration number exists), and the kind of document that was submitted.

`seller_legal_category = BUSINESS_SELLER` can still have `vat_tax_type = NO_REGISTRATION`. The page says so. A student council that plans and sells festival tickets is likely a business under the e-commerce act, and the absence of a business-registration certificate does not make it `NON_BUSINESS_SELLER`. The document branch is therefore `vat_tax_type`, not `seller_legal_category`.

A sole proprietor's `seller_entity_type` is `INDIVIDUAL`, because a sole proprietor is a natural person with no separate legal personality. Only a corporation is `CORPORATION`.

The signup user, the representative, the account holder, and the integrated admin are four identities. For an individual, signup user = representative = account holder is the starting point. For a business, the signup user may not be the representative. The integrated admin is always separate. The share recipient is the store (the partner). It is not the signup user id or the admin id.

---

## What is copied at the sale

The partner's current values change weekly, and again when the partner converts to a registered business. A share already written does not read those current values again. Copy them onto the recipient row at `PAID`.

| Copy | Why |
|------|-----|
| `seller_entity_type` | Account-name rule |
| `business_registration_type` | Whether the number came from a confirmed document |
| `vat_tax_type` | The document kind for this sale |
| Trade name, representative name, business number or unique number | The values printed on the invoice. This copy stays after `PartnerBusiness` is edited later |
| The middle two digits of the unique number | `80`/`89` and `82` follow different tax rules, as below. Folding both into one `UNIQUE_NUMBER_REG` drops that difference |

The resident-registration number itself is not stored on the ledger. Store only a reference key for when a withholding filing is required. The filing file is not part of the first cut.

`seller_legal_category` is the current value for buyer disclosure and threshold notices. It does not need to sit on the share row. If the disclosure text from the time of sale is needed, that snapshot belongs on the order. It is not a settlement total.

Tax rate, taxable / tax-exempt / zero-rated, supply value, and tax amount are still frozen at sale time, as the tax section already says. If `vat_tax_type` is `TAX_FREE`, that supply's tax amount is 0 and the document is a bill (계산서). For `TAXABLE_*`, the price is VAT-inclusive by default, so the captured amount is split into supply value and tax.

---

## The document is chosen per supply

The page's `switch (tax_type)` example issues one document for the whole settlement amount, based on the seller type. Using that example as written would put buyer VAT, the platform fee, and an artist's share on one document. Apply the type to **the supplier and the recipient of that supply**.

### Buyer supply

Each line has one supplier. The host, or the platform. Several recipients do not each issue a tax invoice to the buyer. The buyer's cash receipt and card slip stay with the PG.

The supplier's `vat_tax_type` at that time chooses the document.

| Supplier `vat_tax_type` | Document toward the buyer |
|-------------------------|---------------------------|
| `TAXABLE_GENERAL`, `TAXABLE_SIMPLIFIED_ISSUER` | Tax invoice. Supply value and tax sit on the row |
| `TAXABLE_SIMPLIFIED_NONE` | No tax invoice. Card slip and cash receipt |
| `TAX_FREE` | A bill with tax amount 0 |
| `NO_REGISTRATION` | No buyer tax invoice. Card slip and cash receipt |
| `UNIQUE_NUMBER_REG` | A receipt or bill for a unique-number organization. Middle digits `82` are closer to corporate tax. `80` and `89` are closer to the representative's personal income. Do not lock this to one document |

An unregistered supplier keeps the same share ratio. What changes is the document that goes to the buyer for that line.

### Platform fee

This is a service the platform performs for the recipient. It is not added to the buyer total. If the fee is the platform's recipient row, supply value and tax are frozen on that row. The tax invoice is issued by the platform to that recipient.

If the platform is a general VAT taxpayer, the platform's duty to issue is separate from the recipient being on the simplified scheme. The tax amount on the platform-fee row stays even when the recipient is `TAXABLE_SIMPLIFIED_NONE` or `NO_REGISTRATION`. Whether the recipient deducts that input VAT is the recipient's filing. The ledger does not remove the tax amount in order to match that deduction.

### Payment between recipients

Money the host splits to an artist, a broadcaster, or a consignor is not buyer revenue. The document is chosen by **the recipient's `vat_tax_type` at that time**.

| Recipient `vat_tax_type` | Row |
|--------------------------|-----|
| `TAXABLE_GENERAL`, `TAXABLE_SIMPLIFIED_ISSUER` | Pre-tax share. A tax invoice the recipient issues to the payer |
| `TAX_FREE` | Pre-tax share. A bill. VAT 0 |
| `TAXABLE_SIMPLIFIED_NONE` | Pre-tax share. No tax invoice. A receipt |
| `NO_REGISTRATION` | Pre-tax share plus a withholding row. The page states 3.3% of the settlement amount. Copy that rate onto the row |
| `UNIQUE_NUMBER_REG` with middle digits `82` | A corporate bill or tax invoice. Do not switch this to withholding |
| `UNIQUE_NUMBER_REG` with middle digits `80` or `89` | The representative's personal income. Whether to add a withholding row follows that income classification. Do not subtract 3.3% from the unique number alone |

Withholding is not subtracted inside the share ratio. If the host's 75% is 7,500,000 KRW, that row is 7,500,000 KRW. Withholding is taken separately from that recipient's payout batch. The other recipients' shares do not grow.

Entity type does not decide who the payer is. The first cut is an operator transfer. The supplier and the recipient on the tax document are fixed by the contract and copied when the accrual is written. The platform may send the artist's money, and the tax relationship may still be between the host and the artist. In that case the parties on the document are those two. The owner of the transfer account does not become the party on the document.

---

## What blocks a payout

Shares and accruals are still written when the type is bad. That matches the rule that a failed settlement insert does not roll back payment or stock. The block is the payout batch.

| Condition | Payout |
|-----------|--------|
| An individual (`NO_REGISTRATION`, or an unregistered natural person) whose account holder is not the representative | Do not create that recipient's batch. Leave the accrual |
| A sole proprietor whose account holder is neither the representative's name nor the trade name | Same |
| A corporation whose account holder is not the corporation's name | Same |
| `business_status` is suspended or closed | Do not open a new payout. Do not delete accruals already written |
| `UNKNOWN`, or document review is not finished | Do not open a payout. The share from the time of sale stays frozen at the pre-review value. Sales after approval copy the new type |
| Net after withholding is ≤ 0 | Net it against the next period, under the current rule. Do not create a negative transfer |

The page still leaves open the case of a club or a student council that is paid into the representative's personal account. Until that exception is turned on, use the individual rule in the table above. When it is turned on, put a flag on the partner that a non-representative account is allowed, and let the account check at payout time pass on that flag. Do not edit the share row.

KYC may be collected after signup approval, as the page allows. A share is written even when KYC is empty. If a field required before the real transfer is empty, only that recipient's payout is held.

A minor is a signup-review problem. It is not a ledger calculation. When the legal-guardian documents are missing, the blocks are payout and new sales.

---

## Thresholds change only the next sale

The page's two notices raise the partner's current status. They do not rewrite past shares from withholding into tax invoices.

| Notice | What is counted | When it is crossed |
|--------|-----------------|--------------------|
| Business registration under tax law | Sum of paid orders from January 1 of the year. Refunds and cancellations are removed | Notice above 6,000,000 KRW. The page says a duty to register may arise for global income tax and VAT filing |
| Mail-order registration | Sum and count of orders in the last 180 days. Refunds and cancellations are removed | 20 transactions and 12,000,000 KRW is the mail-order registration bar. Warn at 15 transactions or 10,000,000 KRW |

The count is not the base amount of shares where this partner is a recipient. The page says it is the total order amount consumers paid to that seller. When one order has several recipients, do not add the order amount once per recipient. Count only lines whose buyer-supply supplier is that partner.

Crossing the bar leaves the `vat_tax_type` copy on past rows as it is. After the partner becomes a registered business and the documents are approved, sales at `PAID` from then on copy the new type. Do not delete and rewrite shares on orders already in progress.

The first-cut ledger does not block when a mail-order registration number is missing. `ecommerce_seller_status` is disclosure and a notice. Only documents issued after the number exists copy that number.

---

## Rows added to the ledger

Next to the four records (rule, share, accrual, payout), add only tax rows. Still no chart of accounts.

Beside the recipient and the amount a share row already has, store the copied fields above and that supply's supply value, tax amount, and tax rate. On a platform-fee row those three live inside the one recipient row.

Withholding is not a share. It is a separate row attached to an accrual or a payout: amount, rate (copy the page's 3.3% onto that row), and which accrual it came from. When a refund reduces the accrual, the withholding is reversed too. Correcting a withholding receipt that was already filed is a new document.

Suspension, closure, and an account-name mismatch are hold reasons on the payout status. Do not mark the accrual `failed`.

---

## Leave

- Choosing a tax invoice versus withholding from `seller_legal_category`. A business under the e-commerce act and a VAT registration are different facts.
- Issuing the whole settlement amount from one `vat_tax_type` switch. Buyer supply, platform fee, and payment between recipients would become one document.
- Putting the 3.3% withholding inside the share-ratio math. The other recipients' sum would break.
- Recomputing a share already written because the National Tax Service refreshed the tax type that week.
- Sending every unique-number organization down the non-profit receipt path. The page already splits middle digits `82` from `80` and `89`.
- Treating closure as a deleted accrual. Only new payouts are blocked.
