# 13 AWS pricer

`backend/pricers/aws.ts` + `backend/data/price-books/aws.yaml`. Bills: the AWS column is the bill as charged. Designs: right-sized us-east-1 on-demand; web service priced as both Lambda + API Gateway and Fargate + ALB, cheaper shown with the crossover; NAT gateway added when private resources sit behind compute.

**Status**: built for the preview. **Open**: verify every rate in `aws.yaml` against its source page, set `fetched`, add hand-calculated tests.

**Acceptance**: rates verified and dated; tests per part type and for the Lambda/Fargate crossover.
