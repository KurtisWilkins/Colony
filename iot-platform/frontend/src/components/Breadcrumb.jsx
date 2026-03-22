import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Breadcrumb navigation component.
 * Takes an array of { label, path } items.
 * The last item is rendered as the current page (not a link).
 */
function Breadcrumb({ items }) {
  return (
    <div className="breadcrumb">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={index}>
            {/* Separator between items */}
            {index > 0 && <span className="separator">/</span>}

            {/* Render link for all items except the last (current page) */}
            {isLast ? (
              <span className="current">{item.label}</span>
            ) : (
              <Link to={item.path}>{item.label}</Link>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default Breadcrumb;
