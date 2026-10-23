import { describe, it, expect, beforeEach } from 'vitest'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { AxiosError } from 'axios'
import api, { setupApiAuth } from '../src/api'
import { singleFlight, isRefreshRejected } from '../src/lib/sessionRefresh'

describe('sessionRefresh helpers', () => {
  it('singleFlight shares one in-flight call and runs again after it settles', async () => {
    let calls = 0
    const fn = singleFlight(async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return calls })
    const [a, b, c] = await Promise.all([fn(), fn(), fn()])
    expect([a, b, c]).toEqual([1, 1, 1])
    expect(await fn()).toBe(2)
  })

  it('singleFlight resets after a rejection', async () => {
    let calls = 0
    const fn = singleFlight(async () => { calls++; if (calls === 1) throw new Error('boom'); return 'ok' })
    await expect(fn()).rejects.toThrow('boom')
    expect(await fn()).toBe('ok')
  })

  it('only 401/403 mean the refresh was rejected', () => {
    expect(isRefreshRejected(401)).toBe(true)
    expect(isRefreshRejected(403)).toBe(true)
    for (const s of [undefined, 400, 429, 500, 502, 503, 504]) expect(isRefreshRejected(s)).toBe(false)
  })
})

describe('axios 401 interceptor', () => {
  let token: string | null
  let refreshCalls: number
  let unauthorized: number
  let validToken: string
  let refreshImpl: () => Promise<string | null | undefined>

  const respond = (config: InternalAxiosRequestConfig, status: number, data: unknown = {}) => {
    const response = { data, status, statusText: '', headers: {}, config }
    return status >= 200 && status < 300 ? Promise.resolve(response) : Promise.reject(new AxiosError('fail', undefined, config, null, response as never))
  }

  beforeEach(() => {
    token = 'old'
    validToken = 'new'
    refreshCalls = 0
    unauthorized = 0
    refreshImpl = async () => { await new Promise((r) => setTimeout(r, 20)); token = validToken; return validToken }
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) =>
      respond(config, config.headers.Authorization === `Bearer ${validToken}` ? 200 : 401)) as AxiosAdapter
    setupApiAuth(
      () => token,
      () => { unauthorized++ },
      async () => { refreshCalls++; return refreshImpl() },
    )
  })

  it('parallel 401s trigger exactly one refresh and all requests are retried', async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => api.get('/x')))
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200])
    expect(refreshCalls).toBe(1)
    expect(unauthorized).toBe(0)
  })

  it('a refresh explicitly rejected (null) logs out once, for all waiting requests', async () => {
    refreshImpl = async () => null
    const results = await Promise.allSettled([api.get('/a'), api.get('/b'), api.get('/c')])
    expect(results.every((r) => r.status === 'rejected')).toBe(true)
    expect(refreshCalls).toBe(1)
    expect(unauthorized).toBe(1)
  })

  it('a transient refresh failure (undefined) never logs out', async () => {
    refreshImpl = async () => undefined
    await expect(api.get('/a')).rejects.toBeTruthy()
    expect(unauthorized).toBe(0)
  })

  it('a thrown refresh error (network down) never logs out', async () => {
    refreshImpl = async () => { throw new Error('Network Error') }
    await expect(api.get('/a')).rejects.toBeTruthy()
    expect(unauthorized).toBe(0)
  })

  it('a late 401 sent with a stale token reuses the already refreshed token', async () => {
    await api.get('/x') // refreshes: token -> new
    expect(refreshCalls).toBe(1)
    const res = await api.get('/y', { headers: { Authorization: 'Bearer old' } })
    expect(res.status).toBe(200)
    expect(refreshCalls).toBe(1)
  })

  it('5xx responses are passed through without touching the session', async () => {
    api.defaults.adapter = ((config: InternalAxiosRequestConfig) => respond(config, 503)) as AxiosAdapter
    await expect(api.get('/x')).rejects.toBeTruthy()
    expect(refreshCalls).toBe(0)
    expect(unauthorized).toBe(0)
  })
})
