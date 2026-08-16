export default function handler(request, response) {
  const rawCountry = request.headers['x-vercel-ip-country']
  const country = (Array.isArray(rawCountry) ? rawCountry[0] : rawCountry || '').toUpperCase()
  const market = country === 'TH' ? 'TH' : 'GLOBAL'
  const defaultLocale = market === 'TH' ? 'th' : 'en'

  response.setHeader('Cache-Control', 'private, no-store')
  response.setHeader('Set-Cookie', `doodee_market=${market}; Path=/; Max-Age=2592000; SameSite=Lax; Secure`)
  response.status(200).json({ country: country || null, market, defaultLocale })
}
