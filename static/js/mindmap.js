// static/js/mindmap.js
function drawMindMap(container, data) {
    if (!container || !data || !data.title) {
        container.innerHTML = "<p>Invalid mind map data received.</p>";
        return;
    }
    container.innerHTML = '';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.minHeight = '500px';

    // 1. PRE-PROCESSING: Count leaf nodes to determine branch size
    function countLeafNodes(node) {
        if (!node.children || node.children.length === 0) {
            node.leafCount = 1;
            return 1;
        }
        let count = 0;
        node.children.forEach(child => {
            count += countLeafNodes(child);
        });
        node.leafCount = count;
        return count;
    }
    countLeafNodes(data);

    // 2. LAYOUT CALCULATION: Determine node positions before drawing
    const boundingBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    const nodeDimensions = { width: 160, height: 80 };

    function calculateLayout(node, x, y, level = 0, angleRange = [0, 2 * Math.PI]) {
        node.x = x;
        node.y = y;

        boundingBox.minX = Math.min(boundingBox.minX, x - nodeDimensions.width);
        boundingBox.maxX = Math.max(boundingBox.maxX, x + nodeDimensions.width);
        boundingBox.minY = Math.min(boundingBox.minY, y - nodeDimensions.height);
        boundingBox.maxY = Math.max(boundingBox.maxY, y + nodeDimensions.height);

        if (node.children && node.children.length > 0) {
            let currentAngle = angleRange[0];
            // ADJUSTED: Increased base distance for more spacing between levels
            const distance = 300 - (level * 50);

            node.children.forEach(child => {
                const angleSpan = (child.leafCount / node.leafCount) * (angleRange[1] - angleRange[0]);
                const angle = currentAngle + angleSpan / 2;

                const childX = x + distance * Math.cos(angle);
                const childY = y + distance * Math.sin(angle);

                calculateLayout(child, childX, childY, level + 1, [currentAngle, currentAngle + angleSpan]);
                currentAngle += angleSpan;
            });
        }
    }
    calculateLayout(data, 0, 0);

    // 3. DYNAMIC VIEWBOX: Adjust the view to fit the entire map
    // ADJUSTED: Increased padding for more margin around the map
    const padding = 80;
    const viewBoxWidth = boundingBox.maxX - boundingBox.minX + padding * 2;
    const viewBoxHeight = boundingBox.maxY - boundingBox.minY + padding * 2;
    svg.setAttribute('viewBox', `${boundingBox.minX - padding} ${boundingBox.minY - padding} ${viewBoxWidth} ${viewBoxHeight}`);

    // 4. DRAWING FUNCTIONS (Create nodes and lines)
    function createNode(text, x, y, isRoot = false) {
        const group = document.createElementNS(svgNS, 'g');
        group.setAttribute('transform', `translate(${x}, ${y})`);
        const textElement = document.createElementNS(svgNS, 'text');
        textElement.setAttribute('fill', 'white');
        textElement.setAttribute('text-anchor', 'middle');
        textElement.setAttribute('font-size', isRoot ? '14' : '12');
        textElement.setAttribute('font-family', 'Inter, sans-serif');

        const words = text.split(' ');
        let line = '';
        const maxCharsPerLine = isRoot ? 18 : 16;
        const lineHeight = 16;
        let tspanLines = [];
        words.forEach(word => {
            if ((line + word).length > maxCharsPerLine && line.length > 0) {
                tspanLines.push(line.trim());
                line = word + ' ';
            } else { line += word + ' '; }
        });
        tspanLines.push(line.trim());
        tspanLines.forEach((tspanText, index) => {
            const tspan = document.createElementNS(svgNS, 'tspan');
            tspan.setAttribute('x', 0);
            tspan.setAttribute('dy', index === 0 ? '0' : `${lineHeight}px`);
            tspan.textContent = tspanText;
            textElement.appendChild(tspan);
        });

        const nodePadding = { vertical: isRoot ? 15 : 12, horizontal: 15 };
        const rectWidth = (isRoot ? 160 : 140);
        const rectHeight = (tspanLines.length * lineHeight) + (nodePadding.vertical * 2);
        const textYOffset = -(rectHeight / 2) + lineHeight + nodePadding.vertical - (lineHeight / 4);
        textElement.setAttribute('y', textYOffset);

        const rect = document.createElementNS(svgNS, 'rect');
        rect.setAttribute('x', -rectWidth / 2);
        rect.setAttribute('y', -rectHeight / 2);
        rect.setAttribute('width', rectWidth);
        rect.setAttribute('height', rectHeight);
        rect.setAttribute('rx', 15);
        rect.setAttribute('fill', isRoot ? '#3b82f6' : '#10b981');
        rect.setAttribute('stroke', 'white');
        rect.setAttribute('stroke-width', '2');

        group.appendChild(rect);
        group.appendChild(textElement);
        return group;
    }

    function createLine(x1, y1, x2, y2) {
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('stroke', '#6b7280');
        line.setAttribute('stroke-width', '1.5');
        return line;
    }

    // 5. RENDER THE MAP
    function renderElements(node, isRoot = true) {
        if (node.children) {
            node.children.forEach(child => {
                const line = createLine(node.x, node.y, child.x, child.y);
                svg.appendChild(line);
                renderElements(child, false);
            });
        }
        const nodeElement = createNode(node.title, node.x, node.y, isRoot);
        svg.appendChild(nodeElement);
    }
    renderElements(data);

    container.appendChild(svg);
}