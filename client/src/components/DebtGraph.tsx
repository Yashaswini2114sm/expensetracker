import { useEffect, useRef } from 'react';
import * as d3 from 'd3';

export interface DebtNode extends d3.SimulationNodeDatum {
  id: string;
  name: string;
}

export interface DebtLink extends d3.SimulationLinkDatum<DebtNode> {
  source: string;
  target: string;
  amount: number;
}

interface DebtGraphProps {
  nodes: DebtNode[];
  links: DebtLink[];
  width?: number;
  height?: number;
}

export default function DebtGraph({ nodes, links, width = 600, height = 400 }: DebtGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    // Map source/target ids to node objects to avoid modifying the original props
    const d3Nodes = nodes.map(d => ({ ...d }));
    const d3Links = links.map(d => ({ ...d }));

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    // Setup Force Simulation
    const simulation = d3.forceSimulation<DebtNode, DebtLink>(d3Nodes)
      .force('link', d3.forceLink<DebtNode, DebtLink>(d3Links).id(d => d.id).distance(150))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(40));

    // Marker for arrow heads
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20) // Shift arrow back from node center
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', '#ef4444')
      .style('stroke', 'none');

    // Draw Links
    const link = svg.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(d3Links)
      .enter().append('line')
      .attr('stroke', '#ef4444') // danger color for debt
      .attr('stroke-width', d => Math.max(1, Math.min(8, d.amount / 50)))
      .attr('stroke-opacity', 0.6)
      .attr('marker-end', 'url(#arrowhead)');

    // Draw Link Labels (Amount)
    const linkLabels = svg.append('g')
      .selectAll('text')
      .data(d3Links)
      .enter().append('text')
      .text(d => `₹${d.amount.toFixed(0)}`)
      .attr('font-size', '12px')
      .attr('fill', '#f8fafc')
      .attr('text-anchor', 'middle')
      .attr('dy', -5);

    // Draw Nodes
    const node = svg.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(d3Nodes)
      .enter().append('g')
      .call(d3.drag<SVGGElement, DebtNode>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended)
      );

    node.append('circle')
      .attr('r', 20)
      .attr('fill', d => color(d.id))
      .attr('stroke', '#334155')
      .attr('stroke-width', 2);

    node.append('text')
      .text(d => d.name)
      .attr('x', 25)
      .attr('y', 5)
      .attr('font-size', '14px')
      .attr('fill', '#f8fafc')
      .style('pointer-events', 'none');

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as unknown as DebtNode).x!)
        .attr('y1', d => (d.source as unknown as DebtNode).y!)
        .attr('x2', d => (d.target as unknown as DebtNode).x!)
        .attr('y2', d => (d.target as unknown as DebtNode).y!);

      linkLabels
        .attr('x', d => ((d.source as unknown as DebtNode).x! + (d.target as unknown as DebtNode).x!) / 2)
        .attr('y', d => ((d.source as unknown as DebtNode).y! + (d.target as unknown as DebtNode).y!) / 2);

      node
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, DebtNode, DebtNode>, d: DebtNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, DebtNode, DebtNode>, d: DebtNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, DebtNode, DebtNode>, d: DebtNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, links, width, height]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-textMuted border border-dashed border-border rounded-xl">
        No debts in this group yet. Add an expense!
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-hidden flex items-center justify-center bg-surface/50 rounded-xl">
      <svg ref={svgRef} width={width} height={height}></svg>
    </div>
  );
}
