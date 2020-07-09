

// Load data from json asynchronously and when it's loaded run the chart
d3.json('data.json').then(run)


function run(students) {

  //
  // Constants
  //

  const width = Math.max(400, window.innerWidth)
  const height= 300
  const margin = { top: 10, right: 130, bottom: 10, left: 10 }
  const padding = 0.3
  const psize = 7 // particle size
  const speed = 0.7
  const density = 7
  // const totalParticles = 500 // will be set below when the data is parsed


  //
  // State
  //
  const particles = []
  const cache = {}


  //
  // Data
  //

  // extract routes from students
  const routesAbsolute = Object.keys(students)
    .filter(key => key.startsWith('bit'))
    .map(target => ({ target, value: students[target] }))


  const routes = (() => {
    // normalize values
    const total = d3.sum(routesAbsolute, d => d.value)
    return routesAbsolute.map(r => ({ ...r, value: r.value / total }))
  })()


  const source = routes[3].target // 0..4, where the source node is


  const links = routes.map(({ target }) => ({ source, target }))


  // Distribution of all possible types of particles (each route and each color)
  const thresholds = d3.range(routes.length)
    .map(i => d3.sum(routes.slice(0, i + 1).map(r => r.value)))


  // set to absolute amount of students, but could be any value
  const totalParticles = d3.sum(routesAbsolute, d => d.value)


  //
  // Scales
  //

  // takes a random number [0..1] and returns a route, based on distribution
  const routeScale = d3.scaleThreshold()
    .domain(thresholds)
    .range(routes.map(r => r.target))


  // takes a random number [0..1] and returns a color, based on male/female distribution
  const colorScale = (() => {
    const total = students.males + students.females
    const colorThresholds = [students.females / total]
    return d3.scaleThreshold()
      .domain(colorThresholds)
      .range(['plum', 'powderblue'])
  })()


  const yScale = d3.scaleBand()
    .domain(routes.map(r => r.target))
    .range([height, 0])
    .paddingInner(padding)


  // takes a random number [0..1] and returns vertical position on the band
  const offsetScale = d3.scaleLinear()
    .range([-yScale.bandwidth() / 2, yScale.bandwidth() / 2 - psize])


  // takes a random number [0..1] and returns particle speed
  const speedScale = d3.scaleLinear().range([speed, speed + 0.5])


  //
  // Code
  //

  // Randomly add 0 to `density` particles per tick `t`
  const addParticlesMaybe = (t) => {
    const particlesToAdd = Math.round(Math.random() * density)
    for (let i = 0; i < particlesToAdd; i++) {
      const target = routeScale(Math.random())
      const route = `${source}_${target}`
      const length = cache[route].points.length
      const particle = {
        // `id` is needed to distinguish the particles when some of them finish and disappear
        id: `${t}_${i}`,
        speed: speedScale(Math.random()),
        // used to position a particle vertically on the band
        offset: offsetScale(Math.random()),
        // now is used for aesthetics only, can be used to encode different types (e.g. male vs. female)
        // color: d3.interpolatePiYG(Math.random() * 0.3),
        color: colorScale(Math.random()),
        // current position on the route (will be updated in `chart.update`)
        pos: 0,
        // total length of the route, used to determine that the particle has arrived
        length,
        // when the particle is appeared
        createdAt: t,
        // route assigned to that particle
        route,
      }
      particles.push(particle)
    }
  }


  // Builds SVG <path> string for a link from `source` to `target`
  const sankeyLinkCustom = ({ source, target }) => {
    const curve = 0.37
    const halfH = yScale.bandwidth() / 2
    return `
      M 0,${yScale(source) + halfH}
      L ${width * curve}, ${yScale(source) + halfH}
      C ${width / 2}, ${yScale(source) + halfH}
        ${width / 2}, ${yScale(target) + halfH}
        ${width * (1 - curve)}, ${yScale(target) + halfH}
      L ${width}, ${yScale(target) + halfH}
    `
  }


  //
  // Chart
  //

  function chart() {
    const svg = d3.select('#app').append('svg')
      .attr('width', width)
      .attr('height', height)

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)


    // Apart from aesthetic function links serve as trajectory for moving particles.
    // We'll compute particle positions in the next step
    //
    const link = svg.append("g").attr('class', 'links')
      .attr("fill", "none")
      .attr("stroke-opacity", 0.04)
      .attr("stroke", "#aaa")
      .selectAll("path").data(links)
      .join("path")
      // use custom sankey function here because we don't care of the node heights and link widths
      .attr('d', sankeyLinkCustom)
      .attr("stroke-width", yScale.bandwidth())


    // Compute particle positions along the lines.
    // This technic relies on path.getPointAtLength function that returns coordinates of a point on the path
    // Another example of this technic:
    // https://observablehq.com/@oluckyman/point-on-a-path-detection
    //
    link.each(function(d) {
      const path = this
      const length = path.getTotalLength()
      const points = d3.range(length).map(l => {
        const point = path.getPointAtLength(l)
        return { x: point.x, y: point.y }
      })
      const key = `${d.source}_${d.target}`
      cache[key] = { points }
    })


    // update will be called on each tick, so here we'll perform our animation step
    function update(t) {
      if (particles.length < totalParticles) {
        addParticlesMaybe(t)
      }

      svg.selectAll('.particle').data(particles.filter(p => p.pos < p.length), d => d.id)
        .join(
          enter => enter.append('rect')
            .attr('class', 'particle')
            .attr('fill', d => d.color)
            .attr('width', psize)
            .attr('height', psize),
          update => update,
          exit => exit.remove()
        )
        // At this point we have `cache` with all possible coordinates.
        // We just need to figure out which exactly coordinates to use at time `t`
        //
        .each(function(d) {
          // every particle appears at its own time, so adjust the global time `t` to local time
          const localTime = t - d.createdAt
          d.pos = localTime * d.speed
          // extract current and next coordinates of the point from precomputed cache
          const index = Math.floor(d.pos)
          const coo = cache[d.route].points[index]
          const nextCoo = cache[d.route].points[index + 1]
          if (coo && nextCoo) {
            // `index` is integer, but `pos` is not, so there are ticks when the particle is
            // between the two precomputed points. We use `delta` to compute position between the current
            // and the next coordinates to make the animation smoother
            const delta = d.pos - index // try to set it to 0 to see how jerky the animation is
            const x = coo.x + (nextCoo.x - coo.x) * delta
            const y = coo.y + (nextCoo.y - coo.y) * delta
            d3.select(this)
              .attr('x', x)
              .attr('y', y + d.offset)
          }
      })
    } // update

    // expose the internal `update` function so it can be called from outside
    chart.update = update
  } // chart


  // Render the chart
  chart()

  // Run the animation ~60 times per second
  let elapsed = 0
  requestAnimationFrame(function update() {
    chart.update(elapsed++)
    requestAnimationFrame(update)
  })

} // run
