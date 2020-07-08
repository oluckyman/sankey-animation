

function chart() {
  const svg = d3.select('#app').append('svg')
    .attr('width', width)
    .attr('height', height)

  const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`)
}

//
// Styles
//
const width = Math.max(400, window.innerWidth)
const height = 300
const margin = { top: 10, right: 130, bottom: 10, left: 10 }



chart()
