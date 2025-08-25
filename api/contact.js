import nodemailer from "nodemailer";
import busboy from "busboy";

export default async (req, res) => {
  try {
    // 1. Parse the multipart form
    // 1. Parse the multipart form
    const formData = await new Promise((resolve, reject) => {
      const bb = busboy({ headers: req.headers });
      const result = {
        fields: {},
        files: [],
      };

      bb.on("field", (name, value) => {
        result.fields[name] = value;
      });

      bb.on("file", (name, file, info) => {
        const chunks = [];
        file.on("data", (chunk) => chunks.push(chunk));
        file.on("end", () => {
          result.files.push({
            name: info.filename,
            type: info.mimeType,
            data: Buffer.concat(chunks),
          });
        });
      });

      bb.on("close", () => resolve(result));
      bb.on("error", reject);

      req.pipe(bb);
    });

    // Validate the fields
    if (
      !formData.fields.name ||
      !formData.fields.email ||
      !formData.fields.message
    ) {
      return res.status(400).json({ error: "All fields are required!" });
    }

    // Verify the Turnstile
    const turnstileResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: formData.fields["cf-turnstile-response"],
        }),
      }
    ).then((res) => res.json());

    if (!turnstileResponse.success) {
      return res
        .status(400)
        .json({ error: "Please complete the CAPTCHA verification!" });
    }

    // Sending the email

    const mailOptions = {
      from: `Form Submission <${process.env.SMTP_USER}>`,
      to: process.env.RECIPIENT_EMAIL,
      subject: `New Message from ${formData.fields.name}`,
      text: `Name: ${formData.fields.name}\n Email: ${formData.fields.email} \n Message: ${formData.fields.message}`,
      html: `
        <h2>New message</h2>
        <p><strong>Name: </strong> ${formData.fields.name}</p>
        <p><strong>Email: </strong> ${formData.fields.email}</p>
        <p><strong>Message: </strong></p>
        <p>${formData.fields.message}</p>
      `,
      attachment: formData.files.map((file) => ({
        filename: file.name,
        content: file.data,
        contentType: file.type,
      })),
    };

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      secure: true,
      port: 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail(mailOptions);

    res
      .status(200)
      .json({ success: true, message: "Message sent successfully!" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Internal server error" });
  }
};
