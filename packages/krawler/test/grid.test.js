import { Grid } from '../src/index.js'
import { describe, it, expect, beforeAll } from 'vitest'
describe('krawler:grid', () => {
  const grid = new Grid({
    bounds: [-180, -90, 180, 90],
    origin: [-180, 90],
    size: [4, 3],
    resolution: [90, 90],
    data: [
      0, 1, 1, 0,
      1, 2, 2, 1,
      0, 1, 1, 0
    ]
  })

  beforeAll(() => {
  })

  it('is CommonJS compatible', () => {
    expect(typeof Grid).toBe('function')
  })

  it('gets grid values', () => {
    expect(grid.getValue(0, 0), 'vertex [0,0]').toBe(0)
    expect(grid.getValue(1, 0), 'vertex [1,0]').toBe(1)
    expect(grid.getValue(0, 1), 'vertex [0,1]').toBe(1)
    expect(grid.getValue(1, 1), 'vertex [1,1]').toBe(2)
  })

  it('interpolates grid values', () => {
    // Grid vertex values
    expect(grid.interpolate(-90, 0), 'left-centered vertex').toBe(2)
    expect(grid.interpolate(0, 0), 'right-centered vertex').toBe(2)
    // Ensure it is fine on borders as well
    expect(grid.interpolate(-180, 90), 'top-left border').toBe(0)
    expect(grid.interpolate(-180, -90), 'bottom-left border').toBe(0)
    // Due to longitude wrapping +180° is similar to -180°
    expect(grid.interpolate(180, 90), 'top-right border').toBe(0)
    expect(grid.interpolate(180, -90), 'bottom-right border').toBe(0)
    // Test that we do not try to interpolate values outside grid bounds
    expect(grid.interpolate(-254, 0), 'longitude overflow').toBeUndefined()
    expect(grid.interpolate(0, 128), 'latitude overflow').toBeUndefined()
    // Then test interpolation
    expect(grid.interpolate(-135, 45), 'top-left quad center').toBe(1)
    expect(grid.interpolate(-135, -45), 'bottom-left quad center').toBe(1)
    expect(grid.interpolate(135, 45), 'top-right quad center').toBe(0.5)
    expect(grid.interpolate(135, -45), 'bottom-right quad center').toBe(0.5)
    expect(grid.interpolate(-45, 0), 'grid center').toBe(2)
  })

  it('resamples grid values', () => {
    const resampled = grid.resample([-135, 45], [90, 90], [3, 2])
    // Interpolated grid at grid quad centers should be the following
    // [ 1 1.5 1
    //   1 1.5 1 ]
    expect(resampled).toEqual([1, 1.5, 1, 1, 1.5, 1])
  })

  it('tiles grid values', () => {
    const tileset = grid.tileset([90, 90])
    expect(tileset.map(tile => tile.data)).toEqual([
      [0, 1, 1, 2], [1, 1, 2, 2], [1, 0, 2, 1], [0, 0, 1, 1], [1, 2, 0, 1], [2, 2, 1, 1], [2, 1, 1, 0], [1, 1, 0, 0]
    ])
  })
})
