const pkg = require("./package.json");
const { mathjax } = require("mathjax-full/js/mathjax.js");
const { TeX } = require("mathjax-full/js/input/tex.js");
const { SVG } = require("mathjax-full/js/output/svg.js");
const { CHTML } = require("mathjax-full/js/output/chtml.js");
const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
const { AssistiveMmlHandler } = require("mathjax-full/js/a11y/assistive-mml.js");

const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");
require("mathjax-full/js/util/entities/all.js");

const defaultOptions = {
  output: "svg",
  tex: {
    packages: AllPackages.filter((name) => name !== 'bussproofs'),
    inlineMath: [
      ["$", "$"],
      ["\\(", "\\)"],
    ],
  },
  chtml: {},
  svg: {
    fontCache: "global",
  },
  liteAdaptor: {},
};

module.exports = function (eleventyConfig, options = {}) {
  try {
    eleventyConfig.versionCheck(pkg["11ty"].compatibility);
  } catch (e) {
    console.log(`WARN: Eleventy Plugin (${pkg.name}) Compatibility: ${e.message}`);
  }

  options = {
    ...defaultOptions,
    ...options,
    tex: { ...defaultOptions.tex, ...options.tex },
    svg: { ...defaultOptions.svg, ...options.svg },
    chtml: { ...defaultOptions.chtml, ...options.chtml },
    liteAdaptor: { ...defaultOptions.liteAdaptor, ...options.liteAdaptor },
  };

  const adaptor = liteAdaptor(options.liteAdaptor);
  var OutputJax;
  if (options.output == "mathml") {
    // adapted from https://github.com/mathjax/MathJax-demos-node/blob/d9ba8c61e54683efc04d0e11d5812bc974da65db/direct/tex2mml-page
    // There is no output jax for MathML, filter out bussproofs as it requires one
    options.tex.packages = options.tex.packages.filter((name) => name !== 'bussproofs');
    // MathML does not need an additional AssistiveMmlHandler, as MathML has screen reader support
    RegisterHTMLHandler(adaptor);
  } else {
    OutputJax = createOutputJax(options);
    AssistiveMmlHandler(RegisterHTMLHandler(adaptor));
  }

  const InputJax = new TeX(options.tex);

  eleventyConfig.addTransform("mathjax", function (content, outputPath) {
    if (!(outputPath && outputPath.endsWith(".html"))) {
      return content;
    }
    var html;
    if (options.output == "mathml") {
      const { SerializedMmlVisitor } = require('mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js');
      const visitor = new SerializedMmlVisitor();
      const toMathML = (node => visitor.visitTree(node, html));

      function actionMML(math, doc) {
        const adaptor = doc.adaptor;
        const mml = toMathML(math.root);
        math.typesetRoot = adaptor.firstChild(adaptor.body(adaptor.parse(mml, 'text/html')));
      }

      html = mathjax.document(content, {
        renderActions: {
          typeset: [150, (doc) => { for (const math of doc.math) actionMML(math, doc) }, actionMML]
        },
        InputJax: InputJax,
      });
      html.render();
    } else {
      html = mathjax.document(content, { InputJax, OutputJax });
      html.render();

      // add stylesheet to output document to visually hide assistive MathML
      adaptor.append(html.document.head, OutputJax.styleSheet(html));

      cleanOutput(html, adaptor, options);
    }

    return (
      adaptor.doctype(html.document) + "\n" + adaptor.outerHTML(adaptor.root(html.document)) + "\n"
    );
  });
};

function createOutputJax(options) {
  switch (options.output) {
    case "svg":
      return new SVG(options.svg);
    case "chtml":
      return new CHTML(options.chtml);
    default:
      throw new TypeError("Unsupported output format");
  }
}

function cleanOutput(html, adaptor, options) {
  if (isEmpty(html.math)) {
    switch (options.output) {
      case "svg": {
        adaptor.remove(html.outputJax.svgStyles);
        const globalCache = adaptor.elementById(
          adaptor.body(html.document),
          "MJX-SVG-global-cache"
        );
        if (globalCache != null) {
          adaptor.remove(globalCache);
        }
        break;
      }
      case "chtml":
        adaptor.remove(html.outputJax.chtmlStyles);
        break;
    }
  }
}

function isEmpty(iterable) {
  for (const elem of iterable) {
    return false;
  }
  return true;
}
