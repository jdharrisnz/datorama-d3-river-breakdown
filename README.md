# Archived
This repo has been archived and consolidated into [mci-d3-custom-widgets](https://github.com/jdharrisnz/mci-d3-custom-widgets).

# datorama-d3-river-breakdown
Custom widget for Datorama. Visualises hierarchical breakdowns.

This custom widget creates river-like breakdowns for each dimension you add, and gives you context-specific mouseover percentage calculation. It doesn't re-combine like a sankey flow diagram, as the intention is to show hierarchies.

Subtotals of actual values currently aren't possible, since that data is not included in the widget query response.

![Preview image](image.png)

## Common Style Changes
To change the color of the blocks and paths, add the below to the CSS section of the Custom Widget Editor. You only need to change the colours in the declared variables in the first block.
```
:root {
  --start-grad: #0082d6;
  --end-grad: #00b0f0;
}

#level0-gradient {
  --rect-start: var(--start-grad);
  --rect-end: var(--end-grad);
}

rect {
  fill: var(--end-grad);
}
```

## Set up and Dependencies
Add `riverBreakdown.initialize();` to the JS section of the Custom Widget Editor, and add the below links to the dependencies area (second button at the top left of the Custom Widget Editor).

Script dependencies (must be loaded in this order):
1. `https://d3js.org/d3.v5.min.js`
2. `https://dato-custom-widgets-js-css.s3.eu-west-2.amazonaws.com/river-breakdown/River+Breakdown.js`

Style dependency:
1. `https://dato-custom-widgets-js-css.s3.eu-west-2.amazonaws.com/river-breakdown/River+Breakdown.css`
