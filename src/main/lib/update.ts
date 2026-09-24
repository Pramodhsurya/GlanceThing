import axios from 'axios'

export const GITHUB_REPO = 'Pramodhsurya/GlanceThing'

export async function getLatestVersion() {
  const res = await axios.get(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      validateStatus: () => true
    }
  )

  if (res.status !== 200) return null

  return {
    version: res.data.tag_name,
    downloadUrl: res.data.html_url
  }
}
