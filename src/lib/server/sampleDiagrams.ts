import { diagramData } from '@mermaid-js/examples';

type DiagramDefinition = (typeof diagramData)[number];

const isValidDiagram = (diagram: DiagramDefinition): diagram is Required<DiagramDefinition> => {
  return Boolean(diagram.name && diagram.examples && diagram.examples.length > 0);
};

export const getSampleDiagramMap = (): Record<string, string> => {
  const diagrams = diagramData
    .filter((d) => isValidDiagram(d))
    .map(({ examples, ...rest }) => ({
      ...rest,
      example: examples?.filter(({ isDefault }) => isDefault)[0]
    }));
  const examples: Record<string, string> = {};
  for (const diagram of diagrams) {
    examples[diagram.name.replace(/ (Diagram|Chart|Graph)/, '')] = diagram.example.code;
  }
  return examples;
};

