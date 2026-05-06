# Generating a GitHub Token

To generate a `GITHUB_TOKEN` (Personal Access Token) with the required permissions for GitHub Deployment reporting, follow these steps to create a **Fine-grained Personal Access Token**:

1. Go to your **GitHub Settings**.
2. Scroll down to the bottom of the left sidebar and click **[Developer settings](https://github.com/settings/apps)**.
3. In the left sidebar, click **Personal access tokens**, then select **Fine-grained tokens**.
4. Click the **Generate new token** button in the top right.
5. Fill in the token details:
   * **Token name**: Choose a descriptive name (e.g., `Webhook Deployments Token`).
   * **Expiration**: Set an expiration date according to your security preferences.
6. Under **Repository access**:
   * Select **Only select repositories**.
   * Choose the specific repository (or repositories) where you want this webhook to report deployments.
7. Under **Repository permissions**:
   * Scroll down to **Deployments**.
   * Change the access level to **Read and write**.
8. Scroll to the bottom and click **Generate token**.
9. **Copy the token immediately** (it starts with `github_pat_...`). You will not be able to see it again.

Once you have the token, you can add it to your `.env` file or to your specific repository configuration in `repos/config.json` as `GITHUB_TOKEN`.
