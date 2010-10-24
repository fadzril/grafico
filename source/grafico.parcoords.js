/**
 * Grafico - SVG graphing library - parallel coordinates chart file
 *
 * Copyright (c) 2009 - 2010 Kilian Valkhof (kilianvalkhof.com) - Originally developed by Alex Young (http://alexyoung.org)
 * This file originally developed by Bill Mill (http://billmill.org bill.mill@gmail.com)
 *
 * Visit grafico.kilianvalkhof.com for more information and changelogs.
 * Licensed under the MIT license. http://www.opensource.org/licenses/mit-license.php
 *
 */

"use strict";
Grafico.ParallelCoordinatesGraph = Class.create(Grafico.BaseGraph, {
  /* if this is not defined, this class will fail. This is undocumented; the requirements
   * of chartDefaults, drawPlot, and calculateStep are semi-documented.
   * TODO: fix. */
  setChartSpecificOptions: function () {}
  chartDefaults: function () {}
  drawPlot: function (index, cursor, x, y, color, coords, datalabel, element, graphindex) {}
  calculateStep: function () {
    /* XXX: right now this is copied from line.js */
    return (this.graph_width - (this.options.plot_padding * 2)) / (this.data_size - 1);
  },
});

/* Implementing a new graph type NOTES:
 *
 * o You must override: setChartSpecificOptions, chartDefaults, drawPlot, and calculateStep
 * o calculateStep: 
 */
