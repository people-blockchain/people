import type { ReactNode } from "react";
import type { InlineNode, MdBlock } from "./markdown";

function renderInline(nodes: InlineNode[]): ReactNode[] {
  return nodes.map((node, i) => {
    switch (node.type) {
      case "bold":
        return <strong key={i} className="font-semibold text-ink">{node.text}</strong>;
      case "italic":
        return <em key={i}>{node.text}</em>;
      case "link":
        return (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand underline [overflow-wrap:anywhere] decoration-brand/40 underline-offset-2 hover:decoration-brand"
          >
            {node.text}
          </a>
        );
      case "text":
      default:
        return <span key={i}>{node.text}</span>;
    }
  });
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" } as const;

export function renderLitepaperBlocks(blocks: MdBlock[]): ReactNode {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            if (block.level === 2) {
              return (
                <h2
                  key={i}
                  id={block.id}
                  className="mt-12 scroll-mt-28 text-2xl font-bold tracking-tight text-ink sm:text-3xl"
                >
                  {renderInline(block.inline)}
                </h2>
              );
            }
            if (block.level === 3) {
              return (
                <h3 key={i} id={block.id} className="mt-8 scroll-mt-28 text-lg font-bold text-ink sm:text-xl">
                  {renderInline(block.inline)}
                </h3>
              );
            }
            return (
              <h1 key={i} id={block.id} className="text-3xl font-bold tracking-tight text-ink sm:text-5xl">
                {renderInline(block.inline)}
              </h1>
            );
          }
          case "paragraph":
            return (
              <p key={i} className="mt-4 text-base leading-relaxed text-ink-2">
                {renderInline(block.inline)}
              </p>
            );
          case "list":
            return block.ordered ? (
              <ol key={i} className="mt-4 list-decimal space-y-2 pl-6 text-base leading-relaxed text-ink-2">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            ) : (
              <ul key={i} className="mt-4 list-disc space-y-2 pl-6 text-base leading-relaxed text-ink-2">
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "blockquote":
            return (
              <blockquote
                key={i}
                className="mt-6 rounded-2xl border-l-4 border-brand bg-surface px-5 py-4 text-ink"
              >
                {block.lines.map((line, j) => (
                  <p key={j} className="font-semibold leading-snug">
                    {renderInline(line)}
                  </p>
                ))}
              </blockquote>
            );
          case "hr":
            return <hr key={i} className="my-10 border-line" />;
          case "table":
            return (
              <div key={i} className="mt-6 w-full max-w-full min-w-0 overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse overflow-hidden rounded-2xl border border-line text-sm sm:min-w-0">
                  <thead>
                    <tr className="bg-surface-2">
                      {block.header.map((cell, j) => (
                        <th
                          key={j}
                          className={`border-b border-line px-4 py-3 font-semibold text-ink ${alignClass[block.align[j] ?? "left"]}`}
                        >
                          {renderInline(cell)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="odd:bg-surface even:bg-surface-2/60">
                        {row.map((cell, c) => (
                          <td
                            key={c}
                            className={`border-b border-line px-4 py-3 text-ink-2 last:border-b-0 ${alignClass[block.align[c] ?? "left"]}`}
                          >
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
