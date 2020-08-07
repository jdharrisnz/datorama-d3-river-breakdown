var riverBreakdown = {
  'initialize': function() {
    // Store the query result
      var queryResult = DA.query.getQueryResult();
    
    // Identify the metrics to roll up and the fields by which to group
      var dimFields = [], metricFields = [];
      
      queryResult.fields.forEach((field, index) => {
        field.index = index;
        if (field.type == 'dimension') { dimFields.push(field); }
        else if (field.type == 'metric') { metricFields.push(field); }
      });
    
    // Create hierarchical groups, once for each metric
      var riversGrouped = [];
      
      metricFields.forEach((metric, i) => {
        riversGrouped[i] = {'key': metric.name, 'values': d3.nest()};
        dimFields.forEach(dim => {
          riversGrouped[i].values = riversGrouped[i].values.key(d => d.map(x => x.formattedValue)[dim.index]);
        });
        riversGrouped[i].values = riversGrouped[i].values.rollup(d => {
          return {'value': d.map(x => x[metric.index].value)[0], 'formattedValue': d.map(x => x[metric.index].formattedValue)[0] };
        });
        riversGrouped[i].values = riversGrouped[i].values.entries(queryResult.rows.filter(x => x[metric.index].value > 0));
      });
    
    // Recursively dig to populate hierarchy metadata, some position metadata, and flatten
      var blockXGapPct = 0.75; // Percentage of the visual the x-gaps should take up
      function blockWidth(level) {
        var zerothBlockSize = 20; // Multiplier over later block sizes
        if (level === 0) {
          return (1 - blockXGapPct) / (dimFields.length + zerothBlockSize) * zerothBlockSize;
        }
        else {
          return (1 - blockXGapPct) / (dimFields.length + zerothBlockSize);
        }
      }
      function blockX(level) {
        if (level === 0) {
          return 0;
        }
        else {
          var zerothBlock = blockWidth(0);
          var previousNormalBlocks = blockWidth(level) * (level - 1);
          var gaps = blockXGapPct / dimFields.length * level;
          return zerothBlock + previousNormalBlocks + gaps;
        }
      }
      
      var riversFlat = [];
      var rowCounter = 0;
      
      function analyseHierarchy(dataSet, data, grandTotal, level, parentRowID) {
        data.rowId = rowCounter; rowCounter += 1;
        data.parentRowId = parentRowID;
        data.level = level;
        data.x = blockX(level);
        data.width = blockWidth(level);
        
        if (data.values[0].hasOwnProperty('value')) { // Special condition for when the bottom split is reached
          data.values.forEach(dataChild => {
            dataChild.rowId = rowCounter; rowCounter += 1;
            dataChild.parentRowId = data.rowId;
            dataChild.level = level + 1;
            dataChild.x = blockX(dataChild.level);
            dataChild.width = blockWidth(level);
            dataChild.formattedValue = dataChild.value.formattedValue;
            dataChild.value = dataChild.value.value;
            dataChild.percentage = dataChild.value / grandTotal;
            dataChild.formattedPercentage = d3.format('.2%')(dataChild.percentage);
            riversFlat[dataSet][dataChild.rowId] = dataChild;
          });
        }
        else {
          data.values.forEach(childSplit => {
            analyseHierarchy(dataSet, childSplit, grandTotal, level + 1, data.rowId);
          });
        }
        
        data.percentage = d3.sum(data.values.map(x => x.percentage));
        data.formattedPercentage = d3.format('.2%')(data.percentage);
        riversFlat[dataSet][data.rowId] = data;
        delete riversFlat[dataSet][data.rowId].values;
      }
      
      metricFields.forEach((metric, i) => {
        rowCounter = 0;
        riversFlat.push([]);
        var grandTotal = d3.sum(queryResult.rows.map(x => x[metric.index].value));
        riversGrouped[i].value = grandTotal;
        riversGrouped[i].formattedValue = queryResult.totals[0].data[0][i];
        analyseHierarchy(i, riversGrouped[i], grandTotal, 0, null);
      });
    
    // Populate the rest of the position metadata
      var yGapPct = 0.05;
      var yOrigin = [];
      metricFields.forEach((metric, i) => {
        yOrigin.push(yGapPct * (queryResult.rows.filter(x => x[metric.index].value > 0).length + 1) / 2); 
      });
      
      riversFlat.forEach((river, riverIndex) => {
        new Set(river.map(x => x.level)).forEach(level => {
          river.filter(x => x.level == level).forEach(data => {
            data.riverId = riverIndex;
            if (data.parentRowId === null) {
              data.y = yOrigin[riverIndex];
              data.parentJoinX = null;
              data.parentJoinTopY = null;
              data.parentJoinBottomY = null;
            }
            else {
              var fullLevel = river.filter(x => x.level == level);
              var yGapShiftUp = (fullLevel.length + 1) * yGapPct / 2;
              var earlierItems = fullLevel.filter(x => x.rowId < data.rowId);
              var yGapShiftDown = (earlierItems.length + 1) * yGapPct;
              var yItemShiftDown = d3.sum(earlierItems.map(x => x.percentage));
              data.y = yOrigin[riverIndex] - yGapShiftUp + yGapShiftDown + yItemShiftDown;
              var parentRow = river.filter(x => x.rowId == data.parentRowId)[0];
              data.parentJoinX = parentRow.x + blockWidth(parentRow.level);
              var earlierSiblings = earlierItems.filter(x => x.parentRowId == data.parentRowId);
              data.parentJoinTopY = parentRow.y + d3.sum(earlierSiblings.map(x => x.percentage));
              data.parentJoinBottomY = data.parentJoinTopY + data.percentage;
            }
          });
        });
      });
    
    // Create mouseover and mouseout functions
      function familySearch(riverId, rowId, searchMethod) {
        var siblings = riversFlat[riverId].filter(x => x.parentRowId == riversFlat[riverId][rowId].parentRowId);
        var lookUp = [];
        var lookDown = [];
        
        if (searchMethod == 'full') {
          var lookUpSearch = riversFlat[riverId][rowId].parentRowId;
          while (lookUpSearch !== null) {
            lookUp.push(riversFlat[riverId][lookUpSearch]);
            lookUpSearch = riversFlat[riverId][lookUpSearch].parentRowId;
          }
        }
        
        var lookDownSearch = riversFlat[riverId].filter(x => x.parentRowId == rowId);
        while (lookDownSearch.length > 0) {
          var nextLookDownSearch = [];
          lookDownSearch.forEach(item => {
            lookDown.push(item);
            var itemChildren = riversFlat[riverId].filter(x => x.parentRowId == item.rowId);
            if (itemChildren.length > 0) { nextLookDownSearch = nextLookDownSearch.concat(itemChildren); }
          });
          lookDownSearch = nextLookDownSearch;
        }
        
        var result;
        if (searchMethod == 'full') {
          result = siblings.concat(lookUp).concat(lookDown);
        }
        else if (searchMethod == 'nonParentItems') {
          result = siblings.concat(lookDown);
        }
        
        return result;
      }
      
      function focusItems(riverId, rowId) {
        var fullItems = familySearch(riverId, rowId, 'full');
        d3.selectAll('div.river' + riverId + ', rect.river' + riverId + ', path.river' + riverId).filter(x => !(fullItems.map(item => item.rowId).includes(x.rowId)))
        .transition().style('opacity', 0.3);
    
        var nonParentItems = familySearch(riverId, rowId, 'nonParentItems');
        d3.selectAll('div.river' + riverId).filter(x => nonParentItems.map(item => item.rowId).includes(x.rowId)).selectAll('span.percentage')
        .transition().textTween(d => {
          var newValue = d.value * (1 / d3.sum(nonParentItems.filter(x => x.parentRowId == riversFlat[riverId][rowId].parentRowId).map(x => x.percentage)));
          var currentValue = d.currentValue;
          d.currentValue = newValue;
          var i = d3.interpolate(currentValue, newValue);
          return t => { return d3.format('.2%')(i(t)) };
        });
      }
      
      function unfocusItems() {
        d3.selectAll('div, rect, path')
        .transition().style('opacity', 1);
        
        d3.selectAll('span.percentage')
        .transition().textTween(d => {
          var newValue = d.value;
          var currentValue = d.currentValue;
          d.currentValue = newValue;
          var i = d3.interpolate(currentValue, newValue);
          return t => { return d3.format('.2%')(i(t)) };
        });
      }
    
    // Build the visual
      var svgs = d3.select('#__da-app-content')
      .selectAll('svg')
      .data(riversFlat)
      .join('svg')
        .attr('viewBox', (d, i) => { return '0 0 1 ' + (1 + yOrigin[i] * 2); })
        .attr('preserveAspectRatio', 'none')
        .attr('width', '100%')
        .attr('height', 1 / metricFields.length * 100 + '%')
        .html('<defs><linearGradient id="level0-gradient"><stop offset="0%" stop-color="var(--rect-start)" /><stop offset="100%" stop-color="var(--rect-end)" /></linearGradient></defs>');
      
      var rects = svgs.selectAll('rect')
      .data(d => { return d; }, d => { return d.riverId + '-' + d.rowId; })
      .join('rect')
        .attr('x', d => { return d.x; })
        .attr('y', d => { return d.y; })
        .attr('width', d => { return d.width; })
        .attr('height', d => { return d.percentage; })
        .attr('opacity', 1)
        .attr('class', d => { return 'river' + d.riverId + ' level' + d.level + ' item' + d.rowId; })
        .on('mouseenter', d => { focusItems(d.riverId, d.rowId); })
        .on('mouseleave', unfocusItems());
      
      var xCurveAdjust = blockXGapPct / dimFields.length * (1 / 2);
      
      var paths = svgs.selectAll('path')
      .data(d => { return d.filter(x => x.parentRowId !== null); }, d => { return d.riverId + '-' + d.rowId; })
      .join('path')
        .attr('class', d => { return 'river' + d.riverId + ' level' + d.level + ' item' + d.rowId; })
        .style('opacity', 1)
        .on('mouseenter', d => { focusItems(d.riverId, d.rowId); })
        .on('mouseleave', unfocusItems)
        .attr('d', d => {
          var path = [];
          path.push(['M', d.x, d.y].join(' '));
          path.push(['C', d.x - xCurveAdjust, d.y, d.parentJoinX + xCurveAdjust, d.parentJoinTopY, d.parentJoinX, d.parentJoinTopY].join(' '));
          path.push(['V', d.parentJoinBottomY].join(' '));
          path.push(['C', d.parentJoinX + xCurveAdjust, d.parentJoinBottomY, d.x - xCurveAdjust, d.y + d.percentage, d.x, d.y + d.percentage].join(' '));
          return path.join(' ') + 'Z';
        });
      
      var divContainers = d3.select('#__da-app-content')
      .selectAll('div')
      .data(riversFlat)
      .join('div')
        .style('position', 'absolute')
        .style('left', '0%')
        .style('top', (d, i) => { return i * (1 / metricFields.length) * 100 + '%'; })
        .style('width', '100%')
        .style('height', () => { return 1 / metricFields.length * 100 + '%'; });
      
      var divs = divContainers.selectAll('div')
      .data(d => { return d; }, d => { return d.riverId + '-' + d.rowId; })
      .join('div')
        .attr('class', d => { return 'labelcontainer river' + d.riverId + ' level' + d.level + ' item' + d.rowId; })
        .style('opacity', 1)
        .style('position', 'absolute')
        .style('left', d => {
          if (d.level === 0) { return d.x * 100 + '%'; }
          else { return (d.x - (blockXGapPct / dimFields.length)) * 100 + '%'; }
        })
        .style('top', d => { return d.y / (1 + yOrigin[d.riverId] * 2) * 100 + '%'; })
        .style('width', d => {
          if (d.level === 0) { return d.width * 100 + '%'; }
          else { return (blockXGapPct / dimFields.length) * 100 + '%'; }
        })
        .style('height', d => { return d.percentage / (1 + yOrigin[d.riverId] * 2) * 100 + '%'; } )
        .on('mouseover', d => { focusItems(d.riverId, d.rowId); })
        .on('mouseout', unfocusItems);
      
      var spans = divs.selectAll('span')
      .data(d => {
        var result = [];
        result.push({'text': d.key, 'class': 'labelcontent category river' + d.riverId + ' level' + d.level + ' item' + d.rowId});
        if (d.formattedValue !== undefined) { result.push({'text': d.formattedValue, 'class': 'labelcontent value river' + d.riverId + ' level' + d.level + ' item' + d.rowId}) }
        if (d.level !== 0) { result.push({'text': d.formattedPercentage, 'value': d.percentage, 'currentValue': d.percentage, 'class': 'labelcontent percentage river' + d.riverId + ' level' + d.level + ' item' + d.rowId}) }
        return result;
      })
      .join('span')
        .attr('title', d => { return d.text; })
        .attr('class', d => { return d.class; })
        .text(d => { return d.text; });
      }
};