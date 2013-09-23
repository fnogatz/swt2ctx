var swt2ctx = require('../lib/index');

function replace(str) {
  var tagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
  };
  return str.replace(/[&<>]/g, function replaceTag(tag) {
    return tagsToReplace[tag] || tag;
  });
}

function handleFileSelect(evt) {
  var pre = document.querySelector('pre');
  if (pre)
    pre.remove();

  var file = evt.target.files[0];
  var reader = new FileReader();

  reader.onload = function(e) {
    view = new DataView(this.result);
    swt2ctx(view, { pretty: true }, function(err, xml) {
      var element = document.createElement('pre');
      var classAttribute = document.createAttribute('class');
      classAttribute.value = 'prettyprint';
      element.setAttributeNode(classAttribute);
      document.body.appendChild(element).innerHTML = replace(xml);
      t = xml; // access it via Firebug...

      if (document.querySelector('#pretty').checked === true) {
        prettyPrint();
      }
    });
  }

  reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('file').addEventListener('change', handleFileSelect, false);

  document.querySelector('#pretty').addEventListener('change', function() {
    if (document.querySelector('#pretty').checked === true && !document.querySelector('pre.prettyprinted')) {
      prettyPrint();
    }
  });
});