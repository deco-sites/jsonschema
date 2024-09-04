import cytoscape from "npm:cytoscape";
import { useEffect, useRef, useState } from "preact/hooks";
import { Edge, Node, toGraph } from "../jsonschema/toGraph.ts";

const Graph = () => {
    const containerRef = useRef(null);
    const [jsonInput, setJsonInput] = useState("");
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const cyRef = useRef(null);

    // Utility function to validate that a node or edge ID is valid
    const isValidId = (id: string | undefined | null) => {
        return typeof id === "string" && id.trim().length > 0 &&
            !id.startsWith("#/root");
    };

    const handleJsonSubmit = () => {
        try {
            const { nodes, edges } = toGraph(JSON.parse(jsonInput).schema);

            // Filter out invalid nodes and edges
            const validNodes = nodes.filter((node) => isValidId(node.id));
            const validEdges = edges.filter(
                (edge) => isValidId(edge.from) && isValidId(edge.to),
            );

            setNodes(validNodes);
            setEdges(validEdges);
        } catch (error) {
            console.error("Invalid JSON input:", error);
        }
    };

    useEffect(() => {
        if (!nodes.length) return;

        if (!cyRef.current) {
            cyRef.current = cytoscape({
                container: containerRef.current,
                elements: [
                    ...nodes.map((node) => ({
                        data: {
                            id: node.id,
                            label: node.label,
                        },
                    })),
                    ...edges.map((edge) => ({
                        data: {
                            source: edge.from,
                            target: edge.to,
                            label: edge.label,
                        },
                    })),
                ],
                layout: {
                    name: "cose", // Changed layout for better node distribution
                    padding: 10,
                },
                style: [
                    {
                        selector: "node",
                        style: {
                            "label": "data(label)",
                            "background-color": "#69b3a2",
                            "text-valign": "center",
                            "text-halign": "center",
                        },
                    },
                    {
                        selector: "edge",
                        style: {
                            "label": "data(label)",
                            "width": 2,
                            "line-color": "#999",
                            "target-arrow-color": "#999",
                            "target-arrow-shape": "triangle",
                            "curve-style": "bezier",
                        },
                    },
                ],
            });

            cyRef.current.on("tap", "node", (event: any) => {
                const node = event.target;
                node.style("label", node.data("label"));
            });
        } else {
            const cy = cyRef.current;
            cy.elements().remove();
            cy.add([
                ...nodes.map((node) => ({
                    data: {
                        id: node.id,
                        label: node.label,
                    },
                })),
                ...edges.map((edge) => ({
                    data: {
                        source: edge.from,
                        target: edge.to,
                        label: edge.label,
                    },
                })),
            ]);
            cy.layout({ name: "cose", padding: 10 }).run();
        }

        if (selectedNodeId && cyRef.current) {
            const cy = cyRef.current;
            cy.elements().addClass("faded"); // Add faded class to all
            cy.$(`#${selectedNodeId}`).addClass("focused").connectedEdges()
                .addClass("focused");
        }
    }, [nodes, edges, selectedNodeId]);

    return (
        <div style={{ display: "flex", height: "100vh" }}>
            <div style={{ flex: 1, padding: "10px" }}>
                <textarea
                    rows={10}
                    cols={50}
                    style={{ width: "100%", height: "90%" }}
                    value={jsonInput}
                    onChange={(e) =>
                        setJsonInput(
                            (e.target as unknown as { value: string }).value,
                        )}
                    placeholder="Enter your JSON schema here"
                />
                <br />
                <button
                    onClick={handleJsonSubmit}
                    style={{ marginTop: "10px" }}
                >
                    Generate Graph
                </button>
                <br />
                <select
                    onChange={(e) => setSelectedNodeId(e.target.value)}
                    style={{ marginTop: "10px", width: "100%" }}
                >
                    <option value="">Select a node</option>
                    {nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                            {node.label}
                        </option>
                    ))}
                </select>
            </div>
            <div
                ref={containerRef}
                style={{ flex: 1, height: "100%", border: "1px solid black" }}
            >
            </div>
        </div>
    );
};

export default Graph;
