"use strict";
var Ico = {
  Base: {},

  Normaliser: {},

  SparkLine: {},
  SparkBar: {},

  BaseGraph: {},
  LineGraph: {},
  AreaGraph: {},
  StackGraph: {},
  BarGraph: {},
  HorizontalBarGraph: {}
};

Ico.Base = Class.create({
  normaliseData: function (data) {
    return $A(data).collect(function (value) {
      return this.normalise(value);
    }.bind(this));
  },
  deepCopy: function (obj) {
    var out, i, len;
    if (Object.prototype.toString.call(obj) === '[object Array]') {
        out = [];
        i = 0;
        len = obj.length;
        for (i; i < len; i++) {
            out[i] = arguments.callee(obj[i]);
        }
        return out;
    }
    if (typeof obj === 'object') {
        out = {};
        for (i in obj) {
            out[i] = arguments.callee(obj[i]);
        }
        return out;
    }
    return obj;
  }
});

Ico.Normaliser = Class.create({
  initialize: function (data, options) {
    this.options = {
      start_value: null
    };
    Object.extend(this.options, options || { });

    this.min = data.min();
    this.max = data.max();
    this.standard_deviation = data.standard_deviation();
    this.range = 0;
    this.step = this.labelStep(this.max - this.min);
    this.start_value = this.calculateStart();
    this.process();
  },

  calculateStart: function () {
    var min = this.options.start_value !== null && this.min >= 0 ? this.options.start_value : this.min,
        start_value = this.round(min, 1);

    /* This is a boundary condition */
    if (this.min > 0 && start_value > this.min) {
      return 0;
    }
    return start_value;
  },

  /* Given a value, this method rounds it to the nearest good value for an origin */
  round: function (value, offset) {
    var roundedValue = value,
        multiplier;
        offset = offset || 1;

    if (this.standard_deviation > 0.1) {
      multiplier = Math.pow(10, -offset);
      roundedValue = Math.round(value * multiplier) / multiplier;

      if (roundedValue > this.min) {
        return this.round(value - this.step);
      }
    }
    return roundedValue;
  },

  process: function () {
    this.range = this.max - this.start_value;
    this.step = this.labelStep(this.range);
    if (this.range / this.step > 15) {
      this.step *= 3;
    }
    this.zero_value = (0 - this.start_value) / this.step;
  },

  labelStep: function (value) {
    return Math.pow(10, (Math.log(value) / Math.LN10).round() - 1);
  }
});

Ico.BaseGraph = Class.create(Ico.Base, {
  initialize: function (element, data, options) {
    this.element = element;
    this.data_sets = Object.isArray(data) ? new Hash({ one: data }) : $H(data);
    if (this.chartDefaults().stacked === true) {
      this.real_data = this.deepCopy(this.data_sets);
      this.stackData(this.data_sets);
    }
    this.flat_data = this.data_sets.collect(function (data_set) {return data_set[1]; }).flatten();
    this.normaliser = new Ico.Normaliser(this.flat_data, this.normaliserOptions());
    this.label_step = this.normaliser.step;
    this.range = this.normaliser.range;
    this.start_value = this.normaliser.start_value;
    this.zero_value = this.normaliser.zero_value;
    this.data_size = this.longestDataSetLength();


    /* If one colour is specified, map it to a compatible set */
    if (options && options.colour) {
      options.colours = {};
      this.data_sets.keys().each(function (key) {
        options.colours[key] = options.colour;
      });
    }

    this.options = {
      width:                  parseInt(element.getStyle('width'), 10),
      height:                 parseInt(element.getStyle('height'), 10),
      labels:                 $A($R(1, this.data_size)),            // Label data
      grid:                   true,
      plot_padding:           10,                                   // Padding for the graph line/bar plots
      font_size:              10,                                   // Label font size
      show_horizontal_labels: true,
      show_vertical_labels:   true,
      vertical_label_unit:    '',
      colours:                this.makeRandomColours(),             // Line colours
      background_colour:      element.getStyle('backgroundColor'),
      label_colour:           '#000',                               // Label text colour
      grid_colour:            '#ccc',                               // Grid line colour
      hover_text_colour:      '#fff',                               // hover colour
      markers:                false,                                // false, circle, value
      marker_size:            5,
      meanline:               false,
      padding_top:            20,
      draw_axis:              true,
      datalabels:             '',                                    // interactive, filled with same # of elements as graph items.
      hover_colour:           '',                                    // hover color if there are datalabels
      watermark:              false,
      watermark_orientation:  false,                                 // determine position of watermark. currently available is bottomright and middle
      hide_empty_label_grid:  false,                                 // hide gridlines for labels with no value
      left_padding:           false                                  // set a standard leftpadding regardless of label width
    };
    Object.extend(this.options, this.chartDefaults() || { });
    Object.extend(this.options, options || { });
    /* Padding around the graph area to make room for labels */
    this.x_padding_left = 10 + this.paddingLeftOffset();
    this.x_padding_left += this.options.vertical_label_unit ? 6 : 0;
    this.x_padding_left = this.options.left_padding ? this.options.left_padding : this.x_padding_left;
    this.x_padding_right = 20;
    this.x_padding = this.x_padding_left + this.x_padding_right;
    this.y_padding_top = this.options.padding_top;
    this.y_padding_bottom = 20 + this.paddingBottomOffset();
    this.y_padding = this.y_padding_top + this.y_padding_bottom;

    this.graph_width = this.options.width - this.x_padding;
    this.graph_height = this.options.height - this.y_padding;

    this.step = this.calculateStep();

    /* Calculate how many labels are required */
    this.y_label_count = (this.range / this.label_step).round();
    if ((this.normaliser.min + (this.y_label_count * this.normaliser.step)) < this.normaliser.max) {
      this.y_label_count += 1;
    }

    this.value_labels = this.makeValueLabels(this.y_label_count);
    this.top_value = this.value_labels.last();

    /* Grid control options */
    this.grid_start_offset = -1;

    /* Drawing */
    this.paper = new Raphael(this.element, this.options.width, this.options.height);
    this.background = this.paper.rect(this.x_padding_left, this.y_padding_top, this.graph_width, this.graph_height);
    this.background.attr({fill: this.options.background_colour, stroke: 'none' });

    if (this.options.meanline === true) {
      this.options.meanline = { 'stroke-width': '2px', stroke: '#BBBBBB' };
    }
    /* global hoverSet */
    this.globalMarkerSet = this.paper.set();
    this.globalHoverSet = this.paper.set();
    this.globalBlockSet = this.paper.set();

    this.setChartSpecificOptions();
    this.draw();
    this.globalMarkerSet.toFront();
    this.globalHoverSet.toFront();
    this.globalBlockSet.toFront();
  },

  normaliserOptions: function () {
    return {graph_height : parseInt(this.element.getStyle('height'), 10)};
  },

  chartDefaults: function () {
    /* Define in child class */
  },

  drawPlot: function (index, cursor, x, y, colour, coords, datalabel, element, graphindex) {
    /* Define in child class */
  },
  calculateStep: function () {
    /* Define in child classes */
  },
  getMousePos: function (e) {
    var posx = 0,
        posy = 0,
        mousepos;
    if (!e) {e = window.event; }
    if (e.pageX || e.pageY)   {
      posx = e.pageX;
      posy = e.pageY;
    }
    else if (e.clientX || e.clientY)   {
      posx = e.clientX + document.body.scrollLeft - document.documentElement.scrollLeft;
      posy = e.clientY + document.body.scrollTop - document.documentElement.scrollTop;
    }
    mousepos = {x : posx , y : posy};
    return mousepos;
  },
  makeRandomColours: function (number) {
    var colours = {};
    this.data_sets.each(function (data) {
      colours[data[0]] = Raphael.hsb2rgb(Math.random(), 1, 0.75).hex;
    });
    return colours;
  },

  longestDataSetLength: function () {
    var length = 0;
    this.data_sets.each(function (data_set) {
      length = data_set[1].length > length ? data_set[1].length : length;
    });
    return length;
  },

  roundValue: function (value, length) {
    var multiplier = Math.pow(10, length);
    value *= multiplier;
    value = Math.round(value) / multiplier;
    return value;
  },

  roundValues: function (data, length) {
    return $A(data).collect(function (value) { return this.roundValue(value, length); }.bind(this));
  },

  paddingLeftOffset: function () {
    if (this.options.show_vertical_labels) {
      /* Find the longest label and multiply it by the font size */
      var data = this.flat_data,
          longest_label_length;

      // Round values
      data = this.roundValues(data, 2);

      longest_label_length = $A(data).sort(function (a, b) { return a.toString().length < b.toString().length; }).first().toString().length;
      longest_label_length = longest_label_length > 2 ? longest_label_length - 1 : longest_label_length;
      return longest_label_length * this.options.font_size;
    } else {
      return 0;
    }
  },

  paddingBottomOffset: function () {
    /* height of the text */
    return this.options.font_size;
  },

  normalise: function (value) {
    var total = this.start_value === 0 ? this.top_value : this.range;
    return ((value / total) * this.graph_height);
  },

  draw: function () {
    if (this.options.grid) {
      this.drawGrid();
    }
    if (this.options.watermark) {
      this.drawWatermark();
    }

    if (this.options.draw_axis) {
      this.drawAxis();
    }

    if (this.options.show_vertical_labels) {
      this.drawVerticalLabels();
    }

    if (this.options.show_horizontal_labels) {
      this.drawHorizontalLabels();
    }

    if (!this.options.watermark) {
        this.drawLinesInit(this);
    }

    if (this.start_value !== 0) {
      this.drawFocusHint();
    }
    if (this.options.meanline) {
      this.drawMeanLine(this.normaliseData(this.flat_data));
    }
  },
  drawLinesInit: function (thisgraph) {

    thisgraph.data_sets.each(function (data, index) {
      thisgraph.drawLines(data[0], thisgraph.options.colours[data[0]], thisgraph.normaliseData(data[1]), thisgraph.options.datalabels[data[0]], thisgraph.element,index);
    }.bind(thisgraph));
  },
  drawWatermark: function () {
    var watermark = this.options.watermark,
        watermarkimg = new Image(),
        thisgraph = this;
    watermarkimg.onload = function (){
      var right, bottom, image;
      if (thisgraph.options.watermark_orientation === "middle") {
          right = (thisgraph.graph_width - watermarkimg.width)/2 + thisgraph.x_padding_left;
          bottom = (thisgraph.graph_height - watermarkimg.height)/2 + thisgraph.y_padding_top;
      } else {
        right = thisgraph.graph_width - watermarkimg.width + thisgraph.x_padding_left - 2;
        bottom = thisgraph.graph_height - watermarkimg.height + thisgraph.y_padding_top - 2;
      }
      image = thisgraph.paper.image(watermarkimg.src, right, bottom, watermarkimg.width, watermarkimg.height).attr({'opacity': '0.4'});

      thisgraph.drawLinesInit(thisgraph, thisgraph.data);

      if (thisgraph.options.stacked_fill||thisgraph.options.area) {
        image.toFront();
      }
    };
    watermarkimg.src = watermark.src || watermark;
  },
  drawGrid: function () {
    var path = this.paper.path().attr({ stroke: this.options.grid_colour}),
        y, x, x_labels;

      y = this.graph_height + this.y_padding_top;
      for (var i = 0; i < this.y_label_count+1; i++) {
          path.moveTo(this.x_padding_left-0.5, parseInt(y, 10)+0.5);
          path.lineTo(this.x_padding_left + this.graph_width-0.5, parseInt(y, 10)+0.5);
        y = y - (this.graph_height / this.y_label_count);
      }

      x = this.x_padding_left + this.options.plot_padding + this.grid_start_offset;
      x_labels = this.options.labels.length;

      for (var i = 0; i < x_labels; i++) {
        if ((this.options.hide_empty_label_grid === true && this.options.labels[i] !== "") || this.options.hide_empty_label_grid === false) {
          path.moveTo(parseInt(x, 10), this.y_padding_top);
          path.lineTo(parseInt(x, 10), this.y_padding_top + this.graph_height);
        }
        x = x + this.step;
      }
  },

  drawLines: function (label, colour, data, datalabel, element,graphindex) {
    var coords = this.calculateCoords(data),
        y_offset = (this.graph_height + this.y_padding_top),
        cursor,
        odd_horizontal_offset,
        rel_opacity;

    if (this.options.start_at_zero === false) {
      odd_horizontal_offset=0;
      $A(coords).each(function (coord, index) {
        if (coord[1] === y_offset) {odd_horizontal_offset++;}
      });
      this.options.odd_horizontal_offset = odd_horizontal_offset;

      if (this.options.odd_horizontal_offset > 1) {
        coords.splice(0,this.options.odd_horizontal_offset);
      }
    }

    if (this.options.stacked_fill||this.options.area) {
      if (this.options.area) {
        if(this.options.area_opacity) {
          rel_opacity = this.options.area_opacity;
        } else {
          rel_opacity = 1.5/this.data_sets.collect(function (data_set){return data_set.length;}).length;
        }
        cursor = this.paper.path().attr({stroke: colour, fill: colour, 'stroke-width': '0', 'fill-opacity':rel_opacity});

      } else {
        cursor = this.paper.path().attr({stroke: colour, fill: colour, 'stroke-width': '0'});
      }
      coords.unshift([coords[0][0] , y_offset]);
      coords.push([coords[coords.length-1][0] , y_offset]);
    } else {
      cursor = this.paper.path().attr({stroke: colour, 'stroke-width': this.options.stroke_width + "px"});
    }

    if (this.options.datalabels) {
      var colorattr = (this.options.stacked_fill||this.options.area) ? "fill" : "stroke",
          hover_colour = this.options.hover_colour|| colour;

      var hoverSet = this.paper.set(),
          textpadding = 4,
          text = this.paper.text(cursor.attrs.x, cursor.attrs.y-(this.options.font_size*1.5)-textpadding, datalabel);
      text.attr({'font-size': this.options.font_size, fill:this.options.hover_text_colour,opacity: 1});

      var textbox = text.getBBox(),
          roundRect= this.paper.rect(
            text.attrs.x-(textbox.width/2)-textpadding,
            text.attrs.y-(textbox.height/2)-textpadding,
            textbox.width+(textpadding*2),
            textbox.height+(textpadding*2),
            textpadding*1.5);
      roundRect.attr({fill: this.options.label_colour,opacity: 1, stroke : 0, "stroke-color":this.options.label_colour});

      text.toFront();
      hoverSet.push(roundRect,text).attr({opacity:0}).toFront();
      this.checkHoverPos({rect:roundRect,set:hoverSet});
      this.globalHoverSet.push(hoverSet);

      cursor.node.onmouseover = function (e) {
        if (colorattr==="fill") { cursor.animate({fill : hover_colour,stroke : hover_colour}, 200);}
        else {                    cursor.animate({stroke : hover_colour}, 200);}

        var mousepos = this.getMousePos(e);
        hoverSet[0].attr({
          x:mousepos.x-(textbox.width/2)-textpadding-element.offsetLeft,
          y:mousepos.y-(textbox.height/2)-(this.options.font_size*1.5)-textpadding-element.offsetTop,
          opacity:1});
        hoverSet[1].attr({
          x:mousepos.x-element.offsetLeft,
          y:mousepos.y-(this.options.font_size*1.5)-element.offsetTop,
          opacity:1});

        cursor.node.onmousemove = function (e) {
          var mousepos = this.getMousePos(e);
          hoverSet[0].attr({
            x:mousepos.x-(textbox.width/2)-textpadding-element.offsetLeft,
            y:mousepos.y-(textbox.height/2)-(this.options.font_size*1.5)-textpadding-element.offsetTop,
            opacity:1});
          hoverSet[1].attr({
            x:mousepos.x-element.offsetLeft,
            y:mousepos.y-(this.options.font_size*1.5)-element.offsetTop,
            opacity:1});
          this.checkHoverPos(roundRect,hoverSet);
        }.bind(this);
      }.bind(this);

      cursor.node.onmouseout = function () {
        if (colorattr==="fill") { cursor.animate({fill : colour,stroke : colour}, 200);}
        else {                    cursor.animate({stroke : colour}, 200);}
        hoverSet.attr({opacity:0});
      };
    }

    $A(coords).each(function (coord, index) {
      var x = coord[0],
          y = coord[1];
          this.drawPlot(index, cursor, x, y, colour, coords, datalabel, element,graphindex);
    }.bind(this));
  },

  calculateCoords: function (data) {
    var x = this.x_padding_left + this.options.plot_padding - this.step,
        y_offset = (this.graph_height + this.y_padding_top) + this.normalise(this.start_value);

    return $A(data).collect(function (value) {
      var y = y_offset - value;
      x = x + this.step;
      return [x, y];
    }.bind(this));
  },

  drawFocusHint: function () {
    var length = 5,
        x = this.x_padding_left + (length / 2) - 1,
        y = this.options.height - this.y_padding_bottom,
        cursor = this.paper.path().attr({stroke: this.options.label_colour, 'stroke-width': 2});

    cursor.moveTo(x, y);
    cursor.lineTo(x - length, y - length);
    cursor.moveTo(x, y - length);
    cursor.lineTo(x - length, y - (length * 2));
  },

  drawMeanLine: function (data) {
    var cursor = this.paper.path().attr(this.options.meanline),
        offset = $A(data).inject(0, function (value, sum) { return sum + value; }) / data.length;
        offset = this.options.bar ? offset + (this.zero_value * (this.graph_height / this.y_label_count)) : offset;

    cursor.moveTo(this.x_padding_left - 1, this.options.height - this.y_padding_bottom - offset);
    cursor.lineTo(this.graph_width + this.x_padding_left, this.options.height - this.y_padding_bottom - offset);
  },

  drawAxis: function () {
    var cursor = this.paper.path().attr({stroke: this.options.label_colour});

    //horizontal
    cursor.moveTo(parseInt(this.x_padding_left, 10)-0.5,                    this.options.height - parseInt(this.y_padding_bottom, 10) + 0.5);
    cursor.lineTo(parseInt(this.graph_width + this.x_padding_left, 10)-0.5, this.options.height - parseInt(this.y_padding_bottom, 10) + 0.5);

    //vertical
    cursor.moveTo(parseInt(this.x_padding_left, 10)-0.5, parseInt(this.options.height - this.y_padding_bottom, 10)+0.5);
    cursor.lineTo(parseInt(this.x_padding_left, 10)-0.5, parseInt(this.y_padding_top, 10));
  },

  makeValueLabels: function (steps) {
    var step = this.label_step,
        label = this.start_value,
        labels = [];
    for (var i = 0; i < steps; i++) {
      label = this.roundValue((label + step), 3);
      labels.push(label);
    }
    return labels;
  },
  drawMarkers: function (labels, direction, step, start_offset, font_offsets, extra_font_options) {
  /* Axis label markers */
    function x_offset(value) {
      return value * direction[0];
    }

    function y_offset(value) {
      return value * direction[1];
    }

    /* Start at the origin */
    var x = parseInt(this.x_padding_left, 10) - 0.5 + x_offset(start_offset),
        y = this.options.height - this.y_padding_bottom + y_offset(start_offset),
        cursor = this.paper.path().attr({stroke: this.options.label_colour}),
        font_options = {"font": this.options.font_size + 'px "Arial"', stroke: "none", fill: this.options.label_colour};

    Object.extend(font_options, extra_font_options || {});

    labels.each(function (label) {
      if (this.options.draw_axis && ((this.options.hide_empty_label_grid === true && label !== "") || this.options.hide_empty_label_grid === false)) {
        cursor.moveTo(parseInt(x, 10), parseInt(y, 10)+0.5);
        cursor.lineTo(parseInt(x, 10) + y_offset(5), parseInt(y, 10)+0.5 + x_offset(5));
      }
      this.paper.text(x + font_offsets[0], y - 2 - font_offsets[1], label).attr(font_options).toFront();
      x = x + x_offset(step);
      y = y + y_offset(step);
    }.bind(this));
  },

  drawVerticalLabels: function () {
    var y_step = this.graph_height / this.y_label_count;
    var vertical_label_unit = this.options.vertical_label_unit ? " "+this.options.vertical_label_unit : "";
    for (var i = 0; i < this.value_labels.length; i++) {
      this.value_labels[i] += vertical_label_unit;
    }
    this.drawMarkers(this.value_labels, [0, -1], y_step, y_step, [-8, -2], { "text-anchor": 'end' });
  },
  drawHorizontalLabels: function () {
    this.drawMarkers(this.options.labels, [1, 0], this.step, this.options.plot_padding, [0, (this.options.font_size + 7) * -1]);
  },
  checkHoverPos: function (elements) {
    var diff, rect, rectsize, set, marker, nib, textpadding;
    if (elements.rect) {
      rect = elements.rect;
      rectsize = rect.getBBox();
    }
    if (elements.set) {    set = elements.set;}
    if (elements.marker) { marker = elements.marker;}
    if (elements.nib) {    nib = elements.nib;}
    if (elements.textpadding) { textpadding = elements.textpadding;}

    if (rect && set) {
      /*top*/
      if (rect.attrs.y < 0) {
        if (nib && marker) {
          set.translate(0,set.getBBox().height+(textpadding*2));
          marker.translate(0,-set.getBBox().height-(textpadding*2));
          nib.translate(0,-rectsize.height-textpadding+1).scale(1,-1);
        } else {
          diff = rect.attrs.y;
          set.translate(0,1+(diff*-1));
        }
      }
      /*bottom*/
      if ((rect.attrs.y +rectsize.height) > this.options.height) {
        diff = (rect.attrs.y +rectsize.height) - this.options.height;
        set.translate(0,(diff*-1)-1);
        if (marker) {marker.translate(0,diff+1);}
      }
      /*left*/
      if (rect.attrs.x < 0) {
        diff = rect.attrs.x;
        set.translate((diff*-1)+1,0);
        if (nib) {nib.translate(diff-1,0);}
        if (marker) {marker.translate(diff-1,0);}
      }
      /*right*/
      if ((rect.attrs.x +rectsize.width) > this.options.width) {
        diff = (rect.attrs.x +rectsize.width) - this.options.width;
        set.translate((diff*-1)-1,0);
        if (nib) {nib.translate(diff+1,0);}
        if (marker) {marker.translate(diff+1,0);}
      }
    }
  }
});

/* Supporting methods to make dealing with arrays easier */
/* Note that some of this work to reduce framework dependencies */
Array.prototype.sum = function () {
  for (var i = 0, sum = 0; i < this.length; sum += this[i++]) {}
  return sum;
};

if (typeof Array.prototype.max === 'undefined') {
  Array.prototype.max = function () {
    return Math.max.apply({}, this);
  };
}

if (typeof Array.prototype.min === 'undefined') {
  Array.prototype.min = function () {
    return Math.min.apply({}, this);
  };
}

Array.prototype.mean = function () {
  return this.sum() / this.length;
};

Array.prototype.variance = function () {
  var mean = this.mean(),
      variance = 0;
  for (var i = 0; i < this.length; i++) {
    variance += Math.pow(this[i] - mean, 2);
  }
  return variance / (this.length - 1);
};

Array.prototype.standard_deviation = function () {
  return Math.sqrt(this.variance());
};

/* Raphael path methods. Supporting methods to make dealing with arrays easier */
Raphael.el.isAbsolute = true;
Raphael.el.absolutely = function () {
    this.isAbsolute = 1;
    return this;
};
Raphael.el.relatively = function () {
    this.isAbsolute = 0;
    return this;
};
Raphael.el.moveTo = function (x, y) {
    this._last = {x: x, y: y};
    return this.attr({path: this.attrs.path + ["m", "M"][+this.isAbsolute] + parseFloat(x) + " " + parseFloat(y)});
};
Raphael.el.lineTo = function (x, y) {
    this._last = {x: x, y: y};
    return this.attr({path: this.attrs.path + ["l", "L"][+this.isAbsolute] + parseFloat(x) + " " + parseFloat(y)});
};
Raphael.el.cplineTo = function (x, y, w) {
    this.attr({path: this.attrs.path + ["C", this._last.x + w, this._last.y, x - w, y, x, y]});
    this._last = {x: x, y: y};
    return this;
};
Raphael.el.andClose = function () {
    return this.attr({path: this.attrs.path + "z"});
};

