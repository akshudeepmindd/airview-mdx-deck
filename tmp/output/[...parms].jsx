import React, { useState, useEffect, useCallback, useRef } from 'react'
import { VFile } from 'vfile'
import { VFileMessage } from 'vfile-message'
import * as provider from '@mdx-js/react'
import * as runtime from 'react/jsx-runtime'
// import {statistics} from 'vfile-statistics'
// import {reporter} from 'vfile-reporter'
import { evaluate } from '@mdx-js/mdx'
import remarkGfm from 'remark-gfm'
import remarkFrontmatter from 'remark-frontmatter'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import remarkUnwrapImages from 'remark-unwrap-images';

// import remarkMath from 'remark-math'
import { ErrorBoundary } from 'react-error-boundary'
import { useDebounceFn } from 'ahooks'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router';
import { theme } from '../../constants/theme';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { mdComponents } from "../../constants/MDXProvider";
import * as matter from 'gray-matter';
import { Previewer } from 'pagedjs'

function removeSection(pad, tagName) {
  const re = new RegExp("<" + tagName + "\\s+[^>]*>(.*?)</" + tagName + ">", "gs");
  return (pad.replace(re, ""));
}

function useMdx(defaults) {
  const [state, setState] = useState({ ...defaults, file: null })

  const { run: setConfig } = useDebounceFn(
    async (config) => {
      const file = new VFile({ basename: 'example.mdx', value: config.value })

      const capture = (name) => () => (tree) => {
        file.data[name] = tree
      }

      const remarkPlugins = []

      if (config.gfm) remarkPlugins.push(remarkGfm)
      if (config.frontmatter) {
        remarkPlugins.push(remarkFrontmatter);
        remarkPlugins.push(remarkMdxFrontmatter);
      }
      if (config.unwrapImages) remarkPlugins.push(remarkUnwrapImages)
      // remarkPlugins.push(capture('mdast'))

      try {
        file.result = (
          await evaluate(file, {
            ...provider,
            ...runtime,
            useDynamicImport: true,
            remarkPlugins,
            // rehypePlugins: [capture('hast')],
            // recmaPlugins: [capture('esast')],

          })
        ).default
      } catch (error) {
        // console.log('output:evalutate:Error: ', error)
        // console.log('output:evalutate:Error/Content: ', file)
        const message =
          error instanceof VFileMessage ? error : new VFileMessage(error)

        if (!file.messages.includes(message)) {
          file.messages.push(message)
        }

        message.fatal = true
      }
      // console.log('output:evalutate:Success/Content: ', file)
      setState({ ...config, file })
    },
    { leading: true, trailing: true, wait: 0 }
  )

  return [state, setConfig]
}

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre>{error.message}</pre>
      <button type="button" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  )
}

function FallbackComponent({ error }) {
  const message = new VFileMessage(error)
  message.fatal = true
  return (
    <pre>
      <code>{String(message)}</code>
    </pre>
  )
}


export default dynamic(() => Promise.resolve(Page), {
  ssr: true,
});

function Page() {
  const router = useRouter();
  const [refreshToken, setRefreshToken] = useState(Math.random());
  const [rev, setRev] = useState(0);

  let format = 'default';

  if (router.query.format) {
    format = router.query.format;
  }

  let source = null;
  let location = null;
  if (router.query.parms && router.query.parms.length > 1) {
    source = router.query.parms[0];
    location = router.query.parms.slice(1).join('/');
  }

  const defaultValue = `
    # No Content Loaded
    `;

  const [state, setConfig] = useMdx({
    gfm: true,
    frontmatter: true,
    math: false,
    unwrapImages: true,
    value: defaultValue
  })

  const mdxContent = (format, mdx, pageParms) => {
    // console.log('pageParms: ', pageParms)
    if (pageParms && pageParms.parms) { delete pageParms.parms };
    const { content, data } = matter(mdx);
    let frontmatter = { ...data, ...pageParms };
    if (format === 'ppt') {
      mdx = '<SlidePage>\n' + content + '\n</SlidePage>'
    } else if (format === 'doc') {
      mdx = '<div>\n' + content.replace(/---/g, '') + '\n</div>'
    } else if (format === 'ppt-print') {
      mdx = '<PrintSlide>\n' + content + '\n</PrintSlide>'
    } else {
      mdx = removeSection(mdx, 'TitleSlide');
      mdx = '<MDXViewer>\n' + content.replace(/---/g, '') + '\n</MDXViewer>'
    }
    mdx = matter.stringify(mdx, { ...frontmatter });
    return mdx
  }


  // Create a preview component that can handle errors with try-catch block; for catching invalid JS expressions errors that ErrorBoundary cannot catch.
  const Preview = useCallback(() => {
    try {
      return state.file.result()
    } catch (error) {
      // console.log('/output:Preview:useCallback:Error: ', error)
      return <FallbackComponent error={error} />
    }
  }, [state])

  // const stats = state.file ? statistics(state.file) : {}
  useEffect(() => {
    const fetchFileContent = async () => {
      fetch(`/api/files/file?filePath=${location}`)
        .then((res) => res.json())
        .then(data => {
          if (data.content) {
            // console.log('/output/[...params].jsx:useEffect:router.query: ', router.query)

            // console.log('/output/[...params].jsx:useEffect:content: ', mdxContent(format, data.content, router.query))

            setConfig({ ...state, value: String(mdxContent(format, data.content, router.query)) })
          } else if (error) {
            // console.log('output:error: ', error)
          } else {
            // console.log('output:error: unknown error')
          }
        })
        .catch(error => {
          // console.log(error)
          return { fileData: null, error: error }
        })
        .finally(() => {
          console.log('timeout: ', refreshToken);
        });
    };

    console.log('effectloading file', router)
    if (source === 'file') { 
      fetchFileContent()
      setTimeout(() => setRefreshToken(Math.random()), 50000);
    } else if (!source) {
      setTimeout(() => setRefreshToken(Math.random()), 500);
    }
  }, [refreshToken]);

  useEffect(() => {
    const fetchPadContent = async () => {
      fetch(`/api/etherpad/pad-revs?pad=${location}`)
        .then((res) => res.json())
        .then(data => {
          // console.log('data.rev : ', data.rev , 'rev : ', rev)
          if (data.rev && data.rev > rev) {
            // console.log('new revision :', data.rev)
            const newrev = data.rev
            fetch(`/api/etherpad/pad?pad=${location}&rev=${newrev}`)
              .then((res) => res.json())
              .then(data => {
                if (data.content) {
                  setConfig({ ...state, value: String(mdxContent(format, data.content, router.query)) });
                  setRev(newrev); // update the revision after successful fetch
                }
              })
              .catch(error => {
                // console.log(error)
              })
          }

        })
        .catch(error => {
          // console.log(error)
        })
        .finally(() => {
          setTimeout(() => setRefreshToken(Math.random()), 5000);
        });
    }

    if (source === 'pad') { fetchPadContent() }

  }, [refreshToken]);


  if (format === 'doc') {
    if (state.file && state.file.result) { 
      // console.log('/output:PrintView:file: ', state.file.result) 
    }
    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {state.file && state.file.result ? (<DocumentView><Preview components={mdComponents} /></DocumentView>) : null}
      </ErrorBoundary>
    )
  } else {

    if (state.file && state.file.result) { 
      // console.log('/output:DefaultView:file: ', state.file.result) 
    }
    return (
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {state.file && state.file.result ? (<DefaultView><Preview components={mdComponents} /></DefaultView>) : null}
      </ErrorBoundary>
    )
  };
};





// PDF Print View component
function DocumentView({ children }) {
  // console.log('/output:PrintView:children: ', children);

  const mdxContainer = useRef(null);
  const previewContainer = useRef(null);
  let contentMdx = ``;

  useEffect(() => {
    if (mdxContainer.current !== null) {
      const paged = new Previewer();
      contentMdx = `${mdxContainer.current?.innerHTML}`;
      paged
        .preview(contentMdx,
          ['/pdf.css'],
          previewContainer.current
        )
        .then((flow) => {
          // console.log('====flow====')
          // console.log(flow)
        });
      return () => {
        document.head
          .querySelectorAll("[data-pagedjs-inserted-styles]")
          .forEach((e) => e.parentNode?.removeChild(e));
      };
    }

  }, [children])

  return (
    <>
      <div ref={mdxContainer} style={{ display: 'none' }}>

        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children && children}
        </ThemeProvider>
      </div>
      <div className="pagedjs_page" ref={previewContainer}></div>
    </>

  )
};

// Normal View component
function DefaultView({ children }) {

  // console.log('DefaultView:children: ', children)
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children && children}
    </ThemeProvider>
  )
};
