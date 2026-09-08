import { axes, line, curve, guides, dot, label, tickX, tickY, area, shift, svg } from "./diagram.js";

/**
 * The diagram catalogue.
 *
 * Coordinates are chosen so intersections land on exact values rather than
 * "about there" — a diagram whose equilibrium is visibly off the crossing is
 * worse than none, because it teaches the wrong picture.
 *
 * The baseline market used throughout:
 *   D  from (10,85) to (85,15)
 *   S  from (10,15) to (85,85)
 *   crossing at (47.5, 50)
 *
 * Each entry carries `draw` for the picture and `technique` for the thing that
 * actually earns the mark — which is nearly always the explanation, not the
 * drawing.
 */

const EQ = { x: 47.5, y: 50 };

export const DIAGRAMS = {
  demand: {
    title: "Demand curve",
    unit: 2,
    what: "As price falls, quantity demanded rises.",
    technique: "Label the curve D. The axes are Price and Quantity — never 'cost' or 'amount'.",
    draw: () => svg([
      axes(),
      line(10, 85, 85, 15),
      label(85, 15, "D", { dx: 6, dy: 4 }),
    ], { title: "Demand curve", desc: "A downward-sloping demand curve labelled D." }),
  },

  supply: {
    title: "Supply curve",
    unit: 2,
    what: "As price rises, quantity supplied rises.",
    technique: "Supply slopes up because of rising marginal costs. If asked why, say that — do not just restate the law.",
    draw: () => svg([
      axes(),
      line(10, 15, 85, 85),
      label(85, 85, "S", { dx: 6, dy: 4 }),
    ], { title: "Supply curve", desc: "An upward-sloping supply curve labelled S." }),
  },

  equilibrium: {
    title: "Market equilibrium",
    unit: 2,
    what: "Where quantity demanded equals quantity supplied, so price has no tendency to change.",
    technique: "Always mark Pe and Qe with dashed lines to the axes. Examiners look for the labels, not the crossing.",
    draw: () => svg([
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(85, 85, "S", { dx: 6, dy: 4 }),
      guides(EQ.x, EQ.y), dot(EQ.x, EQ.y),
      tickY(EQ.y, "Pe"), tickX(EQ.x, "Qe"),
    ], { title: "Market equilibrium", desc: "Demand and supply crossing at price Pe and quantity Qe." }),
  },

  "demand-shift": {
    title: "An increase in demand",
    unit: 2,
    what: "A non-price determinant shifts D right, raising both price and quantity.",
    technique: "Shift the whole curve and label it D1 to D2. Moving along the curve instead is the most common error in Unit 2.",
    draw: () => svg([
      axes(),
      line(10, 85, 85, 15), label(76, 24, "D1", { dx: 2, dy: 12 }),
      line(25, 95, 92, 32, "dg-curve dg-curve-2"), label(92, 32, "D2", { dx: 3, dy: 10 }),
      line(10, 15, 85, 85), label(85, 85, "S", { dx: 6, dy: 4 }),
      shift(58, 40, 68, 48),
      guides(EQ.x, EQ.y), dot(EQ.x, EQ.y),
      guides(58, 60), dot(58, 60),
      tickY(EQ.y, "P1"), tickY(60, "P2"), tickX(EQ.x, "Q1"), tickX(58, "Q2"),
    ], { title: "An increase in demand", desc: "Demand shifts right from D1 to D2, raising price and quantity." }),
  },

  surplus: {
    title: "Consumer and producer surplus",
    unit: 2,
    what: "Consumer surplus sits above the price and below demand; producer surplus below the price and above supply.",
    technique: "Community surplus is both areas together, maximised at the competitive equilibrium. That sentence is the allocative efficiency mark.",
    draw: () => svg([
      area([[10, 85], [EQ.x, EQ.y], [10, EQ.y]], "dg-area dg-area-cs"),
      area([[10, 15], [EQ.x, EQ.y], [10, EQ.y]], "dg-area dg-area-ps"),
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(85, 85, "S", { dx: 6, dy: 4 }),
      guides(EQ.x, EQ.y), dot(EQ.x, EQ.y),
      tickY(EQ.y, "Pe"), tickX(EQ.x, "Qe"),
      label(19, 63, "CS", { cls: "dg-label dg-label-key" }),
      label(19, 33, "PS", { cls: "dg-label dg-label-key" }),
    ], { title: "Consumer and producer surplus", desc: "Consumer surplus above the price, producer surplus below it." }),
  },

  "indirect-tax": {
    title: "Indirect tax",
    unit: 2,
    what: "A specific tax shifts supply up by the tax per unit, raising price and cutting quantity.",
    technique: "Show three things or lose marks: the price consumers pay, the price producers keep, and the welfare loss triangle. The gap between the two prices is the tax.",
    draw: () => svg([
      area([[10, 44], [41, 44], [41, 56], [10, 56]], "dg-area dg-area-rev"),
      area([[41, 56], [41, 44], [EQ.x, EQ.y]], "dg-area dg-area-loss"),
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(82, 82, "S", { dx: 5, dy: 10 }),
      line(10, 27, 75, 88, "dg-curve dg-curve-2"), label(75, 88, "S+tax", { dx: 3, dy: 0 }),
      shift(32, 36, 32, 48),
      guides(41, 56), dot(41, 56),
      dot(EQ.x, EQ.y), dot(41, 44),
      tickY(56, "Pc"), tickY(EQ.y, "P1"), tickY(44, "Pp"),
      tickX(41, "Q2"), tickX(EQ.x, "Q1"),
      label(15, 49, "Tax rev.", { cls: "dg-label dg-label-key" }),
    ], { title: "Indirect tax", desc: "Supply shifts up by the tax; consumers pay Pc, producers keep Pp, with a welfare loss triangle." }),
  },

  subsidy: {
    title: "Subsidy",
    unit: 2,
    what: "A subsidy shifts supply down by the amount per unit, lowering price and raising quantity.",
    technique: "The cost to government is the subsidy per unit times the NEW quantity — a rectangle, not a triangle. Say who gains: consumers pay less, producers receive more.",
    draw: () => svg([
      area([[10, 44], [54, 44], [54, 56], [10, 56]], "dg-area dg-area-rev"),
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(82, 82, "S", { dx: 5, dy: 10 }),
      line(10, 3, 85, 73, "dg-curve dg-curve-2"), label(85, 73, "S+sub", { dx: 3, dy: 10 }),
      shift(32, 36, 32, 24),
      guides(54, 44), dot(54, 44), dot(EQ.x, EQ.y), dot(54, 56),
      tickY(56, "Pp"), tickY(EQ.y, "P1"), tickY(44, "Pc"),
      tickX(EQ.x, "Q1"), tickX(54, "Q2"),
      label(15, 49, "Govt cost", { cls: "dg-label dg-label-key" }),
    ], { title: "Subsidy", desc: "Supply shifts down by the subsidy; consumers pay less, producers receive more." }),
  },

  "price-ceiling": {
    title: "Price ceiling (maximum price)",
    unit: 2,
    what: "Set below equilibrium, a maximum price causes a shortage.",
    technique: "It only binds if it is BELOW equilibrium. Mark Qs and Qd separately and label the gap as the shortage.",
    draw: () => svg([
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(85, 85, "S", { dx: 6, dy: 4 }),
      line(2, 36, 90, 36, "dg-curve dg-limit"),
      label(90, 36, "Pmax", { anchor: "end", dy: -6 }),
      dot(33, 36), dot(62, 36),
      tickX(33, "Qs"), tickX(62, "Qd"), tickY(EQ.y, "Pe"),
      line(33, 36, 62, 36, "dg-gap"),
      label(47, 27, "Shortage", { anchor: "middle", cls: "dg-label dg-label-key" }),
    ], { title: "Price ceiling", desc: "A maximum price below equilibrium creates a shortage between Qs and Qd." }),
  },

  "price-floor": {
    title: "Price floor (minimum price)",
    unit: 2,
    what: "Set above equilibrium, a minimum price causes a surplus.",
    technique: "Minimum wage is this diagram with Quantity of labour and Wage on the axes. Relabel them, or you are answering a different question.",
    draw: () => svg([
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(85, 85, "S", { dx: 6, dy: 4 }),
      line(2, 64, 90, 64, "dg-curve dg-limit"),
      label(90, 64, "Pmin", { anchor: "end", dy: -6 }),
      dot(33, 64), dot(62, 64),
      tickX(33, "Qd"), tickX(62, "Qs"), tickY(EQ.y, "Pe"),
      line(33, 64, 62, 64, "dg-gap"),
      label(47, 68, "Surplus", { anchor: "middle", cls: "dg-label dg-label-key" }),
    ], { title: "Price floor", desc: "A minimum price above equilibrium creates a surplus between Qd and Qs." }),
  },

  "negative-production-externality": {
    title: "Negative production externality",
    unit: 2,
    what: "Marginal social cost exceeds marginal private cost, so the market over-produces.",
    technique: "Shade the welfare loss triangle between Qopt and Qm. Most answers describe the externality perfectly and never draw the loss, which caps criterion A at 2.",
    draw: () => svg([
      area([[41, 56], [EQ.x, EQ.y], [EQ.x, 65]], "dg-area dg-area-loss"),
      axes({ y: "Costs / benefits" }),
      line(10, 85, 85, 15), label(85, 15, "D=MPB=MSB", { anchor: "end", dy: 16 }),
      line(10, 15, 85, 85), label(82, 82, "MPC", { dx: 4, dy: 12 }),
      line(10, 30, 75, 88, "dg-curve dg-curve-2"), label(75, 88, "MSC", { dx: 3, dy: 0 }),
      guides(41, 56), dot(41, 56), dot(EQ.x, EQ.y),
      tickX(41, "Qopt"), tickX(EQ.x, "Qm"),
      label(53, 62, "Welfare loss", { cls: "dg-label dg-label-key" }),
    ], { title: "Negative production externality", desc: "MSC lies above MPC; the market produces Qm above the social optimum Qopt, with a welfare loss triangle." }),
  },

  "positive-consumption-externality": {
    title: "Positive consumption externality",
    unit: 2,
    what: "Marginal social benefit exceeds marginal private benefit, so the market under-consumes.",
    technique: "MSB sits ABOVE MPB here, and the welfare loss lies to the RIGHT of the market quantity. Drawing the negative case with labels swapped is a costly slip.",
    draw: () => svg([
      area([[EQ.x, EQ.y], [54, 56], [EQ.x, 62]], "dg-area dg-area-loss"),
      axes({ y: "Costs / benefits" }),
      line(10, 85, 85, 15), label(78, 22, "MPB", { dx: 2, dy: 14 }),
      line(20, 95, 92, 30, "dg-curve dg-curve-2"), label(92, 30, "MSB", { anchor: "end", dy: 14 }),
      line(10, 15, 85, 85), label(85, 85, "S=MPC=MSC", { anchor: "end", dx: -2, dy: -8 }),
      guides(54, 56), dot(54, 56), dot(EQ.x, EQ.y),
      tickX(EQ.x, "Qm"), tickX(54, "Qopt"),
      label(24, 68, "Welfare loss", { cls: "dg-label dg-label-key" }),
    ], { title: "Positive consumption externality", desc: "MSB lies above MPB; the market consumes Qm, below the social optimum Qopt." }),
  },

  ppc: {
    title: "Production possibilities curve",
    unit: 1,
    what: "The maximum combinations of two goods an economy can produce with all resources fully employed.",
    technique: "A point inside is unemployment or inefficiency; outside is unattainable. The curve bows outward because resources are not equally suited to both goods — that is increasing opportunity cost.",
    draw: () => svg([
      axes({ x: "Capital goods", y: "Consumer goods" }),
      curve(10, 88, 62, 80, 88, 12),
      dot(34, 44), label(34, 44, "A", { dx: 6, dy: -3 }),
      dot(80, 66), label(80, 66, "B", { dx: 6, dy: -3 }),
      dot(48, 66), label(48, 66, "C", { dx: 6, dy: -3 }),
      label(12, 24, "A inefficient", { cls: "dg-label dg-note" }),
      label(12, 13, "B unattainable", { cls: "dg-label dg-note" }),
      label(12, 2, "C efficient", { cls: "dg-label dg-note" }),
    ], { title: "Production possibilities curve", desc: "A concave curve with points inside, outside and on it." }),
  },

  "ad-as-deflationary-gap": {
    title: "Deflationary (recessionary) gap",
    unit: 3,
    what: "Equilibrium output sits below the full employment level because aggregate demand is too low.",
    technique: "Mark Yf with a vertical line and show Ye to its LEFT. The gap is the horizontal distance Yf − Ye, not a vertical one.",
    draw: () => svg([
      axes({ x: "Real output (Y)", y: "Price level" }),
      line(10, 85, 85, 15), label(85, 15, "AD", { dx: 5, dy: 4 }),
      line(10, 15, 85, 85), label(85, 85, "SRAS", { anchor: "end", dx: -2, dy: -8 }),
      line(70, 0, 70, 96, "dg-curve dg-limit"), label(70, 96, "LRAS", { anchor: "middle", dy: -6 }),
      guides(EQ.x, EQ.y), dot(EQ.x, EQ.y),
      tickY(EQ.y, "PL1"), tickX(EQ.x, "Ye"), tickX(70, "Yf"),
      line(EQ.x, 22, 70, 22, "dg-gap"),
      label(59, 14, "Gap", { anchor: "middle", cls: "dg-label dg-label-key" }),
    ], { title: "Deflationary gap", desc: "Equilibrium output Ye lies to the left of full employment output Yf." }),
  },

  "keynesian-as": {
    title: "Keynesian AS curve",
    unit: 3,
    what: "Aggregate supply is horizontal with spare capacity, upward sloping as capacity tightens, and vertical at full employment.",
    technique: "Choosing this model rather than the monetarist one IS the evaluation. Say which you are using and how the answer changes under the other.",
    draw: () => svg([
      axes({ x: "Real output (Y)", y: "Price level" }),
      line(8, 25, 40, 25),
      curve(40, 25, 62, 32, 74, 70),
      line(74, 70, 74, 94),
      label(74, 94, "AS", { anchor: "middle", dy: -6 }),
      line(18, 72, 76, 14, "dg-curve dg-curve-2"), label(18, 72, "AD", { dx: -4, dy: -6 }),
      tickX(74, "Yf"),
      label(11, 14, "Spare capacity", { cls: "dg-label dg-note" }),
    ], { title: "Keynesian aggregate supply", desc: "A horizontal, then upward-sloping, then vertical aggregate supply curve." }),
  },

  "lorenz-curve": {
    title: "Lorenz curve",
    unit: 3,
    what: "Cumulative share of income against cumulative share of population; the further from the 45° line, the greater the inequality.",
    technique: "The Gini coefficient is area A divided by (A + B). A HIGHER Gini means MORE inequality — reversing this reverses your whole argument.",
    draw: () => svg([
      axes({ x: "Cumulative % population", y: "Cumulative % income" }),
      line(10, 10, 88, 88, "dg-curve dg-curve-2"),
      label(88, 88, "Equality", { anchor: "end", dy: -8 }),
      curve(10, 10, 64, 18, 88, 88),
      label(66, 42, "Lorenz", { cls: "dg-label" }),
      label(48, 52, "A", { cls: "dg-label dg-label-key" }),
      label(64, 24, "B", { cls: "dg-label dg-label-key" }),
    ], { title: "Lorenz curve", desc: "A Lorenz curve bowing below the line of perfect equality." }),
  },

  monopoly: {
    title: "Monopoly",
    unit: 2,
    hl: true,
    what: "A single firm produces where MC = MR and charges above marginal cost, creating a welfare loss.",
    technique: "MR must be twice as steep as AR and meet the x-axis halfway along it. Drawing MR anywhere else is the fastest way to lose the HL diagram marks.",
    draw: () => svg([
      area([[38, 62], [38, 38], [52, 50]], "dg-area dg-area-loss"),
      axes({ x: "Quantity", y: "Costs / revenue" }),
      line(10, 88, 80, 18), label(80, 18, "AR=D", { anchor: "end", dy: 14 }),
      line(10, 88, 45, 18, "dg-curve dg-curve-2"), label(45, 18, "MR", { dx: 2, dy: 10 }),
      line(10, 20, 85, 66), label(85, 66, "MC", { dx: 4, dy: 4 }),
      guides(38, 62), dot(38, 62), dot(38, 38),
      tickY(62, "Pm"), tickX(38, "Qm"),
      label(55, 58, "Welfare loss", { cls: "dg-label dg-label-key" }),
    ], { title: "Monopoly", desc: "A monopolist producing where MC equals MR and charging Pm, with a welfare loss triangle." }),
  },

  tariff: {
    title: "Tariff",
    unit: 4,
    what: "A tax on imports raises the domestic price, expands domestic output, cuts consumption and shrinks imports.",
    technique: "There are TWO welfare loss triangles — production inefficiency on the left, consumption inefficiency on the right. Shading only one loses the calculation mark.",
    draw: () => svg([
      area([[28, 30], [38, 30], [38, 42]], "dg-area dg-area-loss"),
      area([[62, 30], [72, 30], [62, 42]], "dg-area dg-area-loss"),
      area([[38, 30], [62, 30], [62, 42], [38, 42]], "dg-area dg-area-rev"),
      axes(),
      line(10, 85, 85, 15), label(85, 15, "D", { dx: 6, dy: 4 }),
      line(10, 15, 85, 85), label(85, 85, "S", { dx: 6, dy: 4 }),
      line(2, 30, 90, 30, "dg-curve dg-limit"), label(90, 30, "Pw", { anchor: "end", dy: 14 }),
      line(2, 42, 90, 42, "dg-curve dg-limit"), label(90, 42, "Pw+t", { anchor: "end", dy: -6 }),
      tickX(28, "Q1"), tickX(72, "Q2"),
      label(50, 33, "Revenue", { anchor: "middle", cls: "dg-label dg-label-key" }),
    ], { title: "Tariff", desc: "A tariff raising price above the world price, with government revenue and two welfare loss triangles." }),
  },
};

export const DIAGRAM_IDS = Object.keys(DIAGRAMS);

export function renderDiagram(id) {
  const d = DIAGRAMS[id];
  if (!d) return null;
  return { ...d, id, svg: d.draw() };
}
