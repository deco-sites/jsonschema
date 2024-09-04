export interface Node {
    id: string;
    label: string;
}
export interface Edge {
    from: string;
    to: string;
    label: string;
}
export interface JSONSchema7Definition {
    $ref?: string;
    type?: string | string[];
    allOf?: JSONSchema7Definition[];
    title?: string;
    anyOf?: JSONSchema7Definition[];
    properties?: Record<string, JSONSchema7Definition>;
    items?: JSONSchema7Definition | JSONSchema7Definition[];
}

// Utility to extract label from $ref
const nodeLabelFromRef = (key: string) => {
    if (key.startsWith("#/root")) {
        return key;
    }
    const [firstPart, secondPart] = key.replace("#/definitions/", "").split(
        "@",
    );
    const decoded = atob(firstPart);
    return secondPart ? `${decoded}@${secondPart}` : decoded;
};

export interface Graph {
    nodes: Node[];
    edges: Edge[];
}

const toGraphInternal = (
    definitions: Record<string, JSONSchema7Definition>,
    schema: JSONSchema7Definition,
    currentNodeId: string,
    graph: Graph,
    addNode: (n: Node) => void,
    addEdge: (e: Edge) => void,
    visited: Set<string>, // Track visited nodes
): string => {
    // Prevent circular references
    if (visited.has(currentNodeId)) {
        return currentNodeId;
    }
    visited.add(currentNodeId);

    // Process $ref
    if (schema.$ref) {
        const refKey = schema.$ref.replace("#/definitions/", "");
        const refNodeLabel = nodeLabelFromRef(schema.$ref);

        // Avoid self-references
        if (currentNodeId !== refKey) {
            // Add current node
            addNode({ id: currentNodeId, label: refNodeLabel });

            // Create an edge to the referenced node
            addEdge({ from: currentNodeId, to: refKey, label: `$ref` });

            // Recursively process the referenced node if it's valid
            if (refKey in definitions) {
                return toGraphInternal(
                    definitions,
                    definitions[refKey],
                    refKey,
                    graph,
                    addNode,
                    addEdge,
                    visited
                );
            } else {
                // If the referenced key is not in definitions, create a placeholder node
                const nodeId = crypto.randomUUID();
                addNode({ id: nodeId, label: schema.title ?? "unknown" });
                return nodeId;
            }
        }
        return currentNodeId;
    }

    // Process anyOf
    else if (schema.anyOf) {
        const nodeIds = schema.anyOf.map((subSchema) =>
            toGraphInternal(
                definitions,
                subSchema,
                currentNodeId,
                graph,
                addNode,
                addEdge,
                visited
            )
        );
        const nodeId = nodeIds.join("|");
        addNode({ id: nodeId, label: schema.title ?? `anyOf ${nodeId}` });
        graph.edges.push(...nodeIds.map((to) => ({
            from: nodeId,
            to,
            label: `union`,
        })));
        return nodeId;
    }

    // Process allOf
    else if (schema.allOf) {
        const nodeIds = schema.allOf.map((subSchema) =>
            toGraphInternal(
                definitions,
                subSchema,
                currentNodeId,
                graph,
                addNode,
                addEdge,
                visited
            )
        );

        // Ensure we're not creating an "extends" relationship pointing to itself
        const validNodeIds = nodeIds.filter((nodeId) => nodeId !== currentNodeId);

        const nodeId = validNodeIds.join("&");
        addNode({ id: nodeId, label: schema.title ?? `allOf ${nodeId}` });
        validNodeIds.forEach((to) => {
            addEdge({ from: nodeId, to, label: `extends` });
        });

        return nodeId;
    }

    // Process properties
    else if (schema.properties) {
        const nodes = Object.entries(schema.properties).map(([key, value]) => {
            const label = `property: ${key}`;
            const propNodeId = toGraphInternal(
                definitions,
                value,
                currentNodeId,
                graph,
                addNode,
                addEdge,
                visited
            );
            return { id: propNodeId, label };
        });

        nodes.sort((a, b) => a.id.localeCompare(b.id));
        const nodeId = nodes.map((node) => node.id).join("&");
        nodes.forEach((node) => {
            if (currentNodeId !== node.id) { // Avoid self-pointing edges
                graph.edges.push({ from: currentNodeId, to: node.id, label: node.label });
            }
        });
        addNode({ id: nodeId, label: schema.title ?? "object" });
        return nodeId;
    }

    // Process type: "array" with items
    else if (schema.type === "array" && schema.items) {
        const arrayNodeId = `${currentNodeId}-array`;
        addNode({ id: arrayNodeId, label: `Array of items` });

        if (Array.isArray(schema.items)) {
            schema.items.forEach((item, index) => {
                const itemNodeId = toGraphInternal(
                    definitions,
                    item,
                    `${arrayNodeId}-item-${index}`,
                    graph,
                    addNode,
                    addEdge,
                    visited
                );
                if (arrayNodeId !== itemNodeId) {
                    addEdge({
                        from: arrayNodeId,
                        to: itemNodeId,
                        label: `item[${index}]`,
                    });
                }
            });
        } else {
            const itemNodeId = toGraphInternal(
                definitions,
                schema.items,
                `${arrayNodeId}-item`,
                graph,
                addNode,
                addEdge,
                visited
            );
            if (arrayNodeId !== itemNodeId) {
                addEdge({ from: arrayNodeId, to: itemNodeId, label: `items` });
            }
        }
        return arrayNodeId;
    }

    // Process type
    else if (schema.type) {
        const nodeId = Array.isArray(schema.type)
            ? schema.type.join("|")
            : schema.type;
        addNode({ id: nodeId, label: schema.title ?? "object" });
        return nodeId;
    }

    // Create a fallback node for unknown schema
    const nodeId = crypto.randomUUID();
    addNode({ id: nodeId, label: schema.title ?? "unknown" });
    return nodeId;
};

export interface JsonSchema {
    definitions: Record<string, JSONSchema7Definition>;
}

// Main function to build graph from schema definitions
export const toGraph = (
    { definitions }: JsonSchema,
): Graph => {
    const graph: Graph = { nodes: [], edges: [] };
    const ids: Record<string, string> = {};
    const visited = new Set<string>(); // Track visited nodes

    const addNode = (n: Node) => {
        if (!(n.id in ids)) {
            ids[n.id] = n.id;
            graph.nodes.push(n);
        }
    };

    const addEdge = (e: Edge) => {
        graph.edges.push(e);
    };

    Object.entries(definitions).forEach(([key, schema]) => {
        const label = nodeLabelFromRef(key);
        const nodeId = key;
        addNode({ id: nodeId, label });
        toGraphInternal(
            definitions,
            schema,
            nodeId,
            graph,
            addNode,
            addEdge,
            visited
        );
    });

    return graph;
};
