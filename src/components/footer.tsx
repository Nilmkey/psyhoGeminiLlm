import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import React, { useEffect } from "react";
import Icon from "./icon";
import "../App.css";

export default function Header() {
  const [time, setTime] = React.useState("");

  useEffect(() => {
    const timer = setInterval(() => {
      const date = new Date();

      setTime(
        `${date.getHours().toString().padStart(2, "0")}:${date
          .getMinutes()
          .toString()
          .padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`
      );
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <Paper
      elevation={2}
      sx={{
        display: "flex",
        justifyContent: "space-between",
        background: "#E2C9F2",
      }}
    >
      <Typography variant="h1" px={2}>
        aloalo
      </Typography>
      <Icon />
      <Box
        px={2}
        sx={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h3">cho tam</Typography>

        <Typography variant="h3">{time}</Typography>
      </Box>
    </Paper>
  );
}
